# Vanguard

A small, fast system monitor for Linux, Windows and macOS. It shows CPU, memory, disk and network activity, lists running processes, and lets you end the ones that misbehave.

It keeps its own sampling work light and stops sampling completely when the window is minimized. Like any app built on the system web view, most of its memory is the web view itself.

## Features

- **Overview**: total and per-core CPU, memory and swap, disk read/write with every volume's usage, and network send/receive, each with a live graph.
- **Processes**: name, PID, CPU %, memory and status. Click a column to sort, or type in the filter box to search by name or PID.
- **GPU**: utilization, memory and temperature where the driver reports it. NVIDIA works on Windows and Linux, AMD on Linux and Windows, and Intel on Windows. The most capable GPU is shown first. It only appears when a GPU is found.
- **Performance**: pick CPU, Memory, Disk or Network for a larger graph with peak values. Disk lists every volume with capacity and its own read/write rate. Network lists each interface with its addresses, current speed and totals.
- **Per-item graphs**: when there is more than one volume, network interface or GPU, a dropdown next to the panel title chooses which one the graph shows (or all of them combined). Clicking a volume or interface row does the same. Your choice is remembered.
- **Terminate or force kill** any process, with a confirmation step.
- **Refresh rate** of 0.5, 1, 2 or 5 seconds. Your choice is remembered.

## Requirements

- Node.js 20.19 or newer (the latest release is fine)
- Rust (stable)
- Tauri v2 system dependencies

On Arch Linux:

```
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg patchelf
```

On Windows, install the Visual Studio C++ Build Tools. WebView2 comes with Windows 10 and 11.

On macOS, install the Xcode Command Line Tools with `xcode-select --install`.

## Run

```
npm install
npm run tauri dev
```

The first run compiles the Rust dependencies and takes a few minutes. After that it starts quickly.

## Build

Linux (AppImage):

```
npm run tauri build -- --bundles appimage
```

Windows (installer):

```
npm run tauri build -- --bundles nsis
```

macOS (disk image):

```
npm run tauri build -- --bundles dmg
```

The standalone executable is at `src-tauri/target/release/vanguard` (`vanguard.exe` on Windows).

## Keyboard shortcuts

On the Processes tab:

| Key | Action |
| --- | --- |
| Up / Down | Move the selection |
| Delete | Terminate the selected process |
| Shift + Delete | Force kill the selected process |
| Esc | Cancel a pending confirmation |

## Good to know

- CPU % for each process is relative to the whole machine, so 100% means every core is busy. This matches Windows Task Manager, not `top`.
- On Linux, Terminate sends SIGTERM and Force kill sends SIGKILL. On Windows both end the process immediately.
- Ending processes owned by other users or by the system needs elevated privileges.
- PIDs 0 to 4 and Vanguard itself can't be ended from the app.
- Rows hold their order while your pointer is over the process table, so you can click a busy process without it moving. Move the pointer away and the list re-sorts.
- Your open tab and sort order are remembered. Launching Vanguard a second time focuses the existing window.
- GPU stats need only the normal graphics driver. GPU temperature comes from NVML, with NVAPI as a fallback on Windows for NVIDIA laptop GPUs that report nothing through NVML. AMD and Intel GPUs on Windows have no temperature reading, and CPU temperature is shown on Linux and macOS only (Windows needs a kernel driver to read it, which Vanguard doesn't install), and Intel GPUs on Linux are not shown. There is no GPU panel on macOS yet.
- Volumes are listed once each. Pseudo filesystems, snap mounts and macOS's internal system volumes are hidden.
- macOS builds are not code-signed. The first time you open a downloaded copy, right-click the app and choose Open, or run `xattr -dr com.apple.quarantine /Applications/Vanguard.app`.
- Rates are calculated between samples, so graphs read 0 for the first moment after launching or restoring the window.

## Troubleshooting

**Blank or glitchy window on Linux (AppImage).** Some GPU and Wayland setups have trouble with WebKitGTK. Try:

```
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Vanguard.AppImage
```

**Disk read/write shows nothing.** Some virtual machines and containers don't expose disk counters.

## License

Released under the MIT License.
