//! Background sampler. One thread, parked whenever the window is hidden or
//! minimised, so an idle Vanguard costs essentially nothing.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, OnceLock};
use std::thread::{self, Thread};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{
    CpuRefreshKind, Disks, MemoryRefreshKind, Networks, Pid, ProcessRefreshKind,
    ProcessesToUpdate, RefreshKind, Signal, System,
};
use tauri::{AppHandle, Emitter};

/// sysinfo needs a gap between CPU refreshes to produce meaningful numbers.
const MIN_GAP: Duration = Duration::from_millis(250);

// ---------------------------------------------------------------- payload

/// Short keys keep the IPC payload small: n=name, p=pid, c=cpu %, m=bytes, s=status.
#[derive(Serialize)]
pub struct Proc {
    n: String,
    p: u32,
    c: f32,
    m: u64,
    s: String,
}

/// cpu/cores in %, mu/mt = RAM used/total, su/st = swap, dr/dw = disk B/s, rx/tx = net B/s.
#[derive(Serialize)]
pub struct Snapshot {
    cpu: f32,
    cores: Vec<f32>,
    mu: u64,
    mt: u64,
    su: u64,
    st: u64,
    dr: u64,
    dw: u64,
    rx: u64,
    tx: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    procs: Option<Vec<Proc>>,
}

fn r1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}

// ---------------------------------------------------------------- control

pub struct Control {
    interval_ms: AtomicU64,
    visible: AtomicBool,
    minimized: AtomicBool,
    want_procs: AtomicBool,
    worker: OnceLock<Thread>,
}

impl Control {
    pub fn new() -> Self {
        Self {
            interval_ms: AtomicU64::new(1000),
            visible: AtomicBool::new(true),
            minimized: AtomicBool::new(false),
            want_procs: AtomicBool::new(false),
            worker: OnceLock::new(),
        }
    }

    fn active(&self) -> bool {
        self.visible.load(Relaxed) && !self.minimized.load(Relaxed)
    }

    fn wake(&self) {
        if let Some(t) = self.worker.get() {
            t.unpark();
        }
    }

    pub fn set_interval(&self, ms: u64) {
        self.interval_ms.store(ms.clamp(250, 60_000), Relaxed);
        self.wake();
    }
    pub fn set_visible(&self, v: bool) {
        self.visible.store(v, Relaxed);
        self.wake();
    }
    pub fn set_minimized(&self, v: bool) {
        self.minimized.store(v, Relaxed);
        self.wake();
    }
    pub fn set_want_procs(&self, v: bool) {
        self.want_procs.store(v, Relaxed);
        self.wake();
    }
}

// ---------------------------------------------------------------- sampler

struct Sampler {
    sys: System,
    disks: Disks,
    nets: Networks,
    last: Instant,
}

fn cpu_kind() -> CpuRefreshKind {
    CpuRefreshKind::nothing().with_cpu_usage()
}
fn mem_kind() -> MemoryRefreshKind {
    MemoryRefreshKind::nothing().with_ram().with_swap()
}
fn proc_kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing().with_cpu().with_memory()
}

impl Sampler {
    fn new() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::nothing().with_cpu(cpu_kind()).with_memory(mem_kind()),
        );
        Self {
            sys,
            disks: Disks::new_with_refreshed_list(),
            nets: Networks::new_with_refreshed_list(),
            last: Instant::now(),
        }
    }

    fn refresh(&mut self, procs: bool) {
        self.sys.refresh_cpu_specifics(cpu_kind());
        self.sys.refresh_memory_specifics(mem_kind());
        self.disks.refresh(false);
        self.nets.refresh(false);
        if procs {
            self.sys
                .refresh_processes_specifics(ProcessesToUpdate::All, true, proc_kind());
        }
        self.last = Instant::now();
    }

    fn sample(&mut self, procs: bool) -> Snapshot {
        if let Some(rest) = MIN_GAP.checked_sub(self.last.elapsed()) {
            thread::sleep(rest);
        }
        let dt = self.last.elapsed().as_secs_f64().max(0.001);
        self.refresh(procs);

        // Disks: count each physical device once (btrfs subvolumes etc. repeat names).
        let (mut dr, mut dw) = (0u64, 0u64);
        let mut seen = Vec::new();
        for d in self.disks.list() {
            if seen.contains(&d.name()) {
                continue;
            }
            seen.push(d.name());
            let u = d.usage();
            dr += u.read_bytes;
            dw += u.written_bytes;
        }

        let (mut rx, mut tx) = (0u64, 0u64);
        for (name, n) in &self.nets {
            if name == "lo" || name.starts_with("Loopback") {
                continue;
            }
            rx += n.received();
            tx += n.transmitted();
        }

        let ncpu = self.sys.cpus().len().max(1) as f32;
        let procs = procs.then(|| {
            self.sys
                .processes()
                .iter()
                .filter(|(_, p)| p.thread_kind().is_none())
                .map(|(pid, p)| Proc {
                    n: p.name().to_string_lossy().into_owned(),
                    p: pid.as_u32(),
                    c: r1(p.cpu_usage() / ncpu),
                    m: p.memory(),
                    s: p.status().to_string(),
                })
                .collect()
        });

        Snapshot {
            cpu: r1(self.sys.global_cpu_usage()),
            cores: self.sys.cpus().iter().map(|c| r1(c.cpu_usage())).collect(),
            mu: self.sys.used_memory(),
            mt: self.sys.total_memory(),
            su: self.sys.used_swap(),
            st: self.sys.total_swap(),
            dr: (dr as f64 / dt) as u64,
            dw: (dw as f64 / dt) as u64,
            rx: (rx as f64 / dt) as u64,
            tx: (tx as f64 / dt) as u64,
            procs,
        }
    }
}

pub fn spawn(app: AppHandle, ctl: Arc<Control>) {
    thread::Builder::new()
        .name("vanguard-sampler".into())
        .spawn(move || {
            let _ = ctl.worker.set(thread::current());
            let mut s = Sampler::new();
            let (mut was_active, mut had_procs) = (false, false);

            loop {
                if !ctl.active() {
                    was_active = false;
                    thread::park();
                    continue;
                }
                let procs = ctl.want_procs.load(Relaxed);
                // Resuming, or the process list was just switched on: take a baseline
                // so the first delta-based numbers (CPU %, rates) aren't stale averages.
                if !was_active || (procs && !had_procs) {
                    s.refresh(procs);
                }
                was_active = true;
                had_procs = procs;

                let snap = s.sample(procs);
                let _ = app.emit("metrics", &snap);

                thread::park_timeout(Duration::from_millis(ctl.interval_ms.load(Relaxed)));
            }
        })
        .expect("failed to spawn sampler thread");
}

// ---------------------------------------------------------------- actions

/// Graceful (SIGTERM) by default; `force` sends SIGKILL. On Windows both map to
/// TerminateProcess. Refuses PIDs that are never safe to touch from a monitor.
pub fn kill(pid: u32, force: bool) -> Result<(), String> {
    if pid <= 4 || pid == std::process::id() {
        return Err("This process is protected and can't be terminated here.".into());
    }
    let target = Pid::from_u32(pid);
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&[target]), false, ProcessRefreshKind::nothing());
    let p = sys.process(target).ok_or("The process has already exited.")?;
    let sent = if force {
        p.kill()
    } else {
        p.kill_with(Signal::Term).unwrap_or_else(|| p.kill())
    };
    if sent {
        Ok(())
    } else {
        Err("The system refused the request. Permission may be required.".into())
    }
}
