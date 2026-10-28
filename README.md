# Vanguard

A small, fast system monitor for Linux and Windows. It shows CPU, memory, disk and network activity, lists running processes, and lets you end the ones that misbehave.

It's built to stay out of the way: it uses very little CPU and memory itself, and it stops sampling completely when the window is minimized.

## Features

- **Overview**: total and per-core CPU, memory and swap, disk read/write, and network send/receive, each with a live graph.
- **Processes**: name, PID, CPU %, memory and status. Click a column to sort, or type in the filter box to search by name or PID.
- **Performance**: pick CPU, Memory, Disk or Network for a larger graph with peak values.
- **Terminate or force kill** any process, with a confirmation step.
- **Refresh rate** of 0.5, 1, 2 or 5 seconds. Your choice is remembered.

## Requirements

- Node.js 20.19 or newer (22 recommended)
- Rust (stable)
- Tauri v2 system dependencies

On Arch Linux:

```
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg patchelf
```

On Windows, install the Visual Studio C++ Build Tools. WebView2 comes with Windows 10 and 11.

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
- Rates are calculated between samples, so graphs read 0 for the first moment after launching or restoring the window.

## Troubleshooting

**Blank or glitchy window on Linux (AppImage).** Some GPU and Wayland setups have trouble with WebKitGTK. Try:

```
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./Vanguard.AppImage
```

**Disk read/write shows nothing.** Some virtual machines and containers don't expose disk counters.

## License

Released under the MIT License.
