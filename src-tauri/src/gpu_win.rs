//! Windows GPU sampling for vendors NVML doesn't cover (AMD, Intel).
//!
//! Adapters (name, LUID, VRAM size) come from DXGI. Live numbers come from the same
//! PDH counters Task Manager uses: "GPU Engine" for utilisation and "GPU Adapter
//! Memory" for usage. PDH is called through a tiny hand-written binding, so there is
//! no dependency on a particular `windows` crate version for it.

use std::collections::HashMap;

use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1};

use crate::gpu::Gpu;

type Luid = (u32, u32);

struct Adapter {
    luid: Luid,
    name: String,
    vendor: u32,
    dedicated: u64,
    shared: u64,
}

/// Hardware adapters, excluding the Microsoft software renderer.
fn adapters() -> Vec<Adapter> {
    let Ok(factory) = (unsafe { CreateDXGIFactory1::<IDXGIFactory1>() }) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut i = 0;
    while let Ok(adapter) = unsafe { factory.EnumAdapters1(i) } {
        i += 1;
        let Ok(d) = (unsafe { adapter.GetDesc1() }) else { continue };
        if d.VendorId == 0x1414 {
            continue;
        }
        let len = d.Description.iter().position(|&c| c == 0).unwrap_or(d.Description.len());
        out.push(Adapter {
            luid: (d.AdapterLuid.HighPart as u32, d.AdapterLuid.LowPart),
            name: String::from_utf16_lossy(&d.Description[..len]),
            vendor: d.VendorId,
            dedicated: d.DedicatedVideoMemory as u64,
            shared: d.SharedSystemMemory as u64,
        });
    }
    out
}

// ------------------------------------------------------------------ PDH binding

#[repr(C)]
struct FmtValue {
    status: u32,
    value: f64,
}

#[repr(C)]
struct Item {
    name: *const u16,
    fmt: FmtValue,
}

#[link(name = "pdh")]
extern "system" {
    fn PdhOpenQueryW(source: *const u16, user: usize, query: *mut isize) -> i32;
    fn PdhAddEnglishCounterW(query: isize, path: *const u16, user: usize, counter: *mut isize) -> i32;
    fn PdhCollectQueryData(query: isize) -> i32;
    fn PdhGetFormattedCounterArrayW(
        counter: isize,
        format: u32,
        size: *mut u32,
        count: *mut u32,
        items: *mut Item,
    ) -> i32;
    fn PdhCloseQuery(query: isize) -> i32;
}

const PDH_MORE_DATA: i32 = 0x800007D2_u32 as i32;
const PDH_FMT_DOUBLE: u32 = 0x200;

struct Pdh {
    query: isize,
    engine: isize,
    dedicated: isize,
    shared: isize,
}

impl Pdh {
    fn new() -> Option<Self> {
        unsafe {
            let mut query = 0isize;
            if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 {
                return None;
            }
            let add = |path: &str| -> Option<isize> {
                let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
                let mut counter = 0isize;
                (PdhAddEnglishCounterW(query, wide.as_ptr(), 0, &mut counter) == 0).then_some(counter)
            };
            let (Some(engine), Some(dedicated), Some(shared)) = (
                add(r"\GPU Engine(*)\Utilization Percentage"),
                add(r"\GPU Adapter Memory(*)\Dedicated Usage"),
                add(r"\GPU Adapter Memory(*)\Shared Usage"),
            ) else {
                PdhCloseQuery(query);
                return None;
            };
            // Rate counters need a first collection before they can report anything.
            PdhCollectQueryData(query);
            Some(Self { query, engine, dedicated, shared })
        }
    }
}

impl Drop for Pdh {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.query);
        }
    }
}

/// Every (instance name, value) pair a wildcard counter currently reports.
fn read(counter: isize) -> Vec<(String, f64)> {
    unsafe {
        let (mut size, mut count) = (0u32, 0u32);
        let r = PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, std::ptr::null_mut());
        if r != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // u64 elements keep the buffer 8-byte aligned, which Item requires.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let r = PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, buf.as_mut_ptr().cast());
        if r != 0 {
            return Vec::new();
        }
        std::slice::from_raw_parts(buf.as_ptr().cast::<Item>(), count as usize)
            .iter()
            .filter(|i| i.fmt.status <= 1) // 0 = valid, 1 = new data
            .map(|i| {
                let mut n = 0;
                while *i.name.add(n) != 0 {
                    n += 1;
                }
                (String::from_utf16_lossy(std::slice::from_raw_parts(i.name, n)), i.fmt.value)
            })
            .collect()
    }
}

/// Pulls the adapter LUID out of an instance name such as
/// `pid_1234_luid_0x00000000_0x0000d2a5_phys_0_eng_0_engtype_3D`.
fn parse_luid(name: &str) -> Option<Luid> {
    let rest = name.split_once("luid_0x")?.1;
    let (high, rest) = rest.split_once("_0x")?;
    let low: String = rest.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
    Some((u32::from_str_radix(high, 16).ok()?, u32::from_str_radix(&low, 16).ok()?))
}

fn sum_by_luid(counter: isize) -> HashMap<Luid, f64> {
    let mut m = HashMap::new();
    for (name, v) in read(counter) {
        if let Some(l) = parse_luid(&name) {
            *m.entry(l).or_insert(0.0) += v;
        }
    }
    m
}

// ------------------------------------------------------------------ public

pub struct WinGpus {
    adapters: Vec<Adapter>,
    pdh: Pdh,
}

impl WinGpus {
    /// `nvidia_covered`: NVML already reports the NVIDIA cards, so skip them here.
    pub fn new(nvidia_covered: bool) -> Option<Self> {
        let adapters: Vec<Adapter> = adapters()
            .into_iter()
            .filter(|a| !(nvidia_covered && a.vendor == 0x10DE))
            .collect();
        if adapters.is_empty() {
            return None;
        }
        Some(Self { adapters, pdh: Pdh::new()? })
    }

    /// (dedicated VRAM, gpu) per adapter. Temperature isn't available through counters.
    pub fn sample(&self) -> Vec<(u64, Gpu)> {
        unsafe {
            PdhCollectQueryData(self.pdh.query);
        }

        // Utilisation: sum processes per engine type, then take the busiest engine type.
        let mut per_engine: HashMap<(Luid, String), f64> = HashMap::new();
        for (name, v) in read(self.pdh.engine) {
            let (Some(luid), Some((_, kind))) = (parse_luid(&name), name.split_once("engtype_")) else {
                continue;
            };
            *per_engine.entry((luid, kind.to_owned())).or_insert(0.0) += v;
        }
        let mut busy: HashMap<Luid, f64> = HashMap::new();
        for ((luid, _), v) in per_engine {
            let e = busy.entry(luid).or_insert(0.0);
            if v > *e {
                *e = v;
            }
        }

        let dedicated = sum_by_luid(self.pdh.dedicated);
        let shared = sum_by_luid(self.pdh.shared);

        self.adapters
            .iter()
            .map(|a| {
                // Integrated GPUs carve their memory out of system RAM.
                let integrated = a.dedicated < (1 << 30);
                let (used, total) = if integrated {
                    (shared.get(&a.luid).copied().unwrap_or(0.0), a.shared)
                } else {
                    (dedicated.get(&a.luid).copied().unwrap_or(0.0), a.dedicated)
                };
                (
                    a.dedicated,
                    Gpu {
                        n: a.name.clone(),
                        u: busy.get(&a.luid).copied().unwrap_or(0.0).min(100.0) as f32,
                        mu: used as u64,
                        mt: total,
                        t: None,
                    },
                )
            })
            .collect()
    }
}
