//! Volume list and per-volume I/O rates.
//!
//! Every real volume is reported once. Duplicates (bind mounts, btrfs subvolumes,
//! macOS APFS system volumes) and pseudo filesystems are dropped.

use serde::Serialize;
use sysinfo::{DiskKind, DiskRefreshKind, Disks};

/// n=label or device, m=mount point, f=filesystem, k=SSD/HDD/"" , t=total bytes,
/// a=available bytes, r/w=read/write bytes per second, x=removable.
#[derive(Serialize)]
pub struct DiskInfo {
    pub n: String,
    pub m: String,
    pub f: String,
    pub k: &'static str,
    pub t: u64,
    pub a: u64,
    pub r: u64,
    pub w: u64,
    #[serde(skip_serializing_if = "is_false")]
    pub x: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

/// Cheap I/O-only refresh on most ticks; every 10th tick also re-lists volumes
/// (so a plugged-in drive appears) and refreshes capacity.
pub fn refresh(disks: &mut Disks, tick: u64) {
    if tick % 10 == 0 {
        disks.refresh_specifics(true, DiskRefreshKind::nothing().with_storage().with_io_usage());
    } else {
        let io = DiskRefreshKind::nothing().with_io_usage();
        for d in disks.list_mut() {
            d.refresh_specifics(io);
        }
    }
}

fn wanted(mount: &str, fs: &str, total: u64) -> bool {
    let _ = (mount, fs);
    if total == 0 {
        return false; // empty card reader, optical drive without a disc
    }
    #[cfg(target_os = "linux")]
    if matches!(fs, "tmpfs" | "devtmpfs" | "overlay" | "squashfs" | "ramfs" | "efivarfs")
        || mount.starts_with("/snap/")
        || mount.starts_with("/var/lib/docker")
    {
        return false;
    }
    #[cfg(target_os = "macos")]
    if mount == "/"
        || (mount.starts_with("/System/Volumes/") && mount != "/System/Volumes/Data")
        || mount.starts_with("/private/var/")
    {
        return false;
    }
    true
}

/// Returns (total read B/s, total write B/s, volumes).
pub fn collect(disks: &Disks, dt: f64) -> (u64, u64, Vec<DiskInfo>) {
    let (mut read, mut write) = (0u64, 0u64);
    let mut seen: Vec<String> = Vec::new();
    let mut out = Vec::new();

    for d in disks.list() {
        let mount = d.mount_point().to_string_lossy();
        let fs = d.file_system().to_string_lossy();
        let total = d.total_space();
        if !wanted(&mount, &fs, total) {
            continue;
        }

        // Linux: one entry per device. Windows and macOS: one per mount point
        // (volume labels are often empty or repeated there).
        let name = d.name().to_string_lossy();
        let key = if cfg!(target_os = "linux") && !name.is_empty() {
            name.to_string()
        } else {
            mount.to_string()
        };
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);

        let u = d.usage();
        let r = (u.read_bytes as f64 / dt) as u64;
        let w = (u.written_bytes as f64 / dt) as u64;
        read += r;
        write += w;

        out.push(DiskInfo {
            n: name.into_owned(),
            m: mount.into_owned(),
            f: fs.into_owned(),
            k: match d.kind() {
                DiskKind::SSD => "SSD",
                DiskKind::HDD => "HDD",
                _ => "",
            },
            t: total,
            a: d.available_space(),
            r,
            w,
            x: d.is_removable(),
        });
    }

    out.sort_by(|a, b| a.m.cmp(&b.m));
    (read, write, out)
}
