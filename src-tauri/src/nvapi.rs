//! GPU temperature through NVAPI, the interface the NVIDIA app uses.
//!
//! NVML (what `nvidia-smi` uses) reports 0 for the temperature of some laptop GPUs,
//! while NVAPI has the real value. NVAPI is a plain C library, so no C code of our
//! own is needed: `nvapi64.dll` ships with the NVIDIA driver, and we look up its
//! functions at runtime. If the DLL, a function or a struct version isn't there,
//! `new()` or `temperature()` returns `None` and Vanguard simply shows no temperature.

use std::ffi::c_void;

#[link(name = "kernel32")]
extern "system" {
    fn LoadLibraryW(name: *const u16) -> *mut c_void;
    fn GetProcAddress(module: *mut c_void, name: *const u8) -> *mut c_void;
}

type QueryInterface = unsafe extern "C" fn(u32) -> *mut c_void;
type Initialize = unsafe extern "C" fn() -> i32;
type EnumGpus = unsafe extern "C" fn(*mut *mut c_void, *mut u32) -> i32;
type FullName = unsafe extern "C" fn(*mut c_void, *mut u8) -> i32;
type GetThermal = unsafe extern "C" fn(*mut c_void, u32, *mut Thermal) -> i32;

// Function IDs for nvapi_QueryInterface (stable across driver versions).
const ID_INITIALIZE: u32 = 0x0150_E828;
const ID_ENUM_GPUS: u32 = 0xE5AC_921F;
const ID_FULL_NAME: u32 = 0xCEEE_8E9F;
const ID_THERMAL: u32 = 0xE364_0A56;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct Sensor {
    controller: i32,
    default_min: i32,
    default_max: i32,
    current: i32,
    target: i32,
}

#[repr(C)]
struct Thermal {
    version: u32,
    count: u32,
    sensors: [Sensor; 3],
}

pub struct Nvapi {
    gpus: Vec<(String, *mut c_void)>, // (normalised name, handle)
    thermal: GetThermal,
}

/// NVML says "NVIDIA GeForce RTX 3060", NVAPI says "GeForce RTX 3060".
fn normalise(name: &str) -> String {
    name.trim().to_lowercase().trim_start_matches("nvidia ").to_owned()
}

unsafe fn cast<T>(p: *mut c_void) -> Option<T> {
    if p.is_null() {
        None
    } else {
        Some(std::mem::transmute_copy(&p))
    }
}

impl Nvapi {
    pub fn new() -> Option<Self> {
        unsafe {
            let dll: Vec<u16> = "nvapi64.dll\0".encode_utf16().collect();
            let lib = LoadLibraryW(dll.as_ptr());
            if lib.is_null() {
                return None;
            }
            let query: QueryInterface = cast(GetProcAddress(lib, b"nvapi_QueryInterface\0".as_ptr()))?;
            let init: Initialize = cast(query(ID_INITIALIZE))?;
            let enum_gpus: EnumGpus = cast(query(ID_ENUM_GPUS))?;
            let full_name: FullName = cast(query(ID_FULL_NAME))?;
            let thermal: GetThermal = cast(query(ID_THERMAL))?;

            if init() != 0 {
                return None;
            }
            let mut handles = [std::ptr::null_mut::<c_void>(); 64];
            let mut count = 0u32;
            if enum_gpus(handles.as_mut_ptr(), &mut count) != 0 || count == 0 {
                return None;
            }

            let mut gpus = Vec::new();
            for &h in &handles[..(count as usize).min(64)] {
                let mut buf = [0u8; 64];
                let name = if full_name(h, buf.as_mut_ptr()) == 0 {
                    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
                    String::from_utf8_lossy(&buf[..end]).into_owned()
                } else {
                    String::new()
                };
                gpus.push((normalise(&name), h));
            }
            Some(Self { gpus, thermal })
        }
    }

    /// Temperature in C for the GPU matching `name` (the NVML name), or the one at
    /// `index` when names don't line up.
    pub fn temperature(&self, name: &str, index: usize) -> Option<u32> {
        let want = normalise(name);
        let handle = self
            .gpus
            .iter()
            .find(|(n, _)| !n.is_empty() && (*n == want || n.contains(&want) || want.contains(n.as_str())))
            .or_else(|| self.gpus.get(index))
            .map(|(_, h)| *h)?;

        // The struct carries its own size and a version; the driver rejects a
        // mismatch without writing anything, so trying both versions is safe.
        for ver in [1u32, 2] {
            for sensor in [15u32, 0] {
                let mut t = Thermal {
                    version: (std::mem::size_of::<Thermal>() as u32) | (ver << 16),
                    count: 0,
                    sensors: [Sensor::default(); 3],
                };
                let status = unsafe { (self.thermal)(handle, sensor, &mut t) };
                if status == 0 {
                    let n = (t.count as usize).min(3);
                    if let Some(s) = t.sensors[..n].iter().find(|s| (1..150).contains(&s.current)) {
                        return Some(s.current as u32);
                    }
                }
            }
        }
        None
    }
}
