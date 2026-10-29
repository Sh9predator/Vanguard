//! GPU sampling. Each GPU is read from the best source available on this machine:
//!
//! * NVIDIA (Windows and Linux): NVML, loaded at runtime from the driver.
//! * AMD (Linux): the amdgpu counters under /sys/class/drm.
//! * Everything else on Windows (AMD, Intel, and NVIDIA without NVML): the Windows
//!   "GPU Engine" and "GPU Adapter Memory" performance counters (see gpu_win.rs).
//!
//! The result is ordered with the most capable (largest dedicated VRAM) GPU first,
//! so a laptop shows its discrete GPU ahead of the integrated one.

use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Serialize;

/// n=name, u=utilisation %, mu/mt=VRAM used/total bytes, t=temperature in C when known.
#[derive(Serialize)]
pub struct Gpu {
    pub n: String,
    pub u: f32,
    pub mu: u64,
    pub mt: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t: Option<u32>,
}

pub struct GpuSampler {
    nvml: Option<Nvml>,
    #[cfg(target_os = "linux")]
    amd: Vec<std::path::PathBuf>,
    #[cfg(windows)]
    win: Option<crate::gpu_win::WinGpus>,
    /// Second opinion for temperatures NVML won't give (some laptop GPUs).
    #[cfg(windows)]
    nvapi: Option<crate::nvapi::Nvapi>,
}

impl GpuSampler {
    pub fn new() -> Self {
        // Fails quietly (and quickly) on machines without an NVIDIA driver.
        let nvml = Nvml::init().ok();

        #[cfg(windows)]
        let win = {
            let nvidia_covered = nvml.as_ref().map_or(0, |n| n.device_count().unwrap_or(0)) > 0;
            crate::gpu_win::WinGpus::new(nvidia_covered)
        };
        #[cfg(windows)]
        let nvapi = if nvml.is_some() { crate::nvapi::Nvapi::new() } else { None };

        Self {
            nvml,
            #[cfg(target_os = "linux")]
            amd: amd_cards(),
            #[cfg(windows)]
            win,
            #[cfg(windows)]
            nvapi,
        }
    }

    pub fn sample(&self) -> Vec<Gpu> {
        // (rank, gpu): rank is dedicated VRAM, used only for ordering.
        let mut out: Vec<(u64, Gpu)> = Vec::new();

        if let Some(nvml) = &self.nvml {
            for i in 0..nvml.device_count().unwrap_or(0) {
                let Ok(dev) = nvml.device_by_index(i) else { continue };
                let (Ok(mem), Ok(util)) = (dev.memory_info(), dev.utilization_rates()) else {
                    continue;
                };
                let name = dev.name().unwrap_or_else(|_| format!("NVIDIA GPU {i}"));
                // Some drivers answer 0 through NVML for mobile GPUs. That is "no
                // reading", not a real 0 degrees, so fall through to NVAPI.
                #[allow(unused_mut)]
                let mut t = dev
                    .temperature(TemperatureSensor::Gpu)
                    .ok()
                    .filter(|&t| t > 0 && t < 150);
                #[cfg(windows)]
                if t.is_none() {
                    if let Some(api) = &self.nvapi {
                        t = api.temperature(&name, i as usize);
                    }
                }
                out.push((
                    mem.total,
                    Gpu {
                        n: name,
                        u: util.gpu as f32,
                        mu: mem.used,
                        mt: mem.total,
                        t,
                    },
                ));
            }
        }

        #[cfg(target_os = "linux")]
        for dev in &self.amd {
            if let Some(g) = read_amd(dev) {
                out.push((g.mt, g));
            }
        }

        #[cfg(windows)]
        if let Some(w) = &self.win {
            out.extend(w.sample());
        }

        out.sort_by(|a, b| b.0.cmp(&a.0));
        out.into_iter().map(|(_, g)| g).collect()
    }
}

// ------------------------------------------------------------- AMD (Linux sysfs)

#[cfg(target_os = "linux")]
fn read_str(path: &std::path::Path) -> Option<String> {
    std::fs::read_to_string(path).ok().map(|s| s.trim().to_owned())
}

/// `/sys/class/drm/cardN/device` for every amdgpu card that exposes a busy counter.
#[cfg(target_os = "linux")]
fn amd_cards() -> Vec<std::path::PathBuf> {
    let Ok(dir) = std::fs::read_dir("/sys/class/drm") else {
        return Vec::new();
    };
    let mut cards: Vec<_> = dir
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            name.strip_prefix("card")
                .is_some_and(|rest| !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_digit()))
        })
        .map(|p| p.join("device"))
        .filter(|d| {
            read_str(&d.join("vendor")).as_deref() == Some("0x1002")
                && d.join("gpu_busy_percent").exists()
        })
        .collect();
    cards.sort();
    cards
}

#[cfg(target_os = "linux")]
fn read_amd(dev: &std::path::Path) -> Option<Gpu> {
    let u: f32 = read_str(&dev.join("gpu_busy_percent"))?.parse().ok()?;
    let mu: u64 = read_str(&dev.join("mem_info_vram_used"))?.parse().ok()?;
    let mt: u64 = read_str(&dev.join("mem_info_vram_total"))?.parse().ok()?;
    let t = std::fs::read_dir(dev.join("hwmon"))
        .ok()?
        .flatten()
        .find_map(|h| read_str(&h.path().join("temp1_input"))?.parse::<u32>().ok())
        .map(|milli| milli / 1000);
    Some(Gpu {
        n: read_str(&dev.join("product_name")).unwrap_or_else(|| "AMD GPU".into()),
        u,
        mu,
        mt,
        t,
    })
}
