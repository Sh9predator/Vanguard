mod disks;
mod gpu;
#[cfg(windows)]
mod gpu_win;
#[cfg(windows)]
mod nvapi;
mod monitor;

use monitor::Control;
use std::sync::Arc;
use tauri::{Manager, State, WindowEvent};

#[tauri::command]
fn set_interval(ms: u64, ctl: State<'_, Arc<Control>>) {
    ctl.set_interval(ms);
}

#[tauri::command]
fn set_visible(visible: bool, ctl: State<'_, Arc<Control>>) {
    ctl.set_visible(visible);
}

#[tauri::command]
fn set_want_procs(want: bool, ctl: State<'_, Arc<Control>>) {
    ctl.set_want_procs(want);
}

/// `async` here means "run on a worker thread", never on the UI thread.
#[tauri::command(async)]
fn kill_process(pid: u32, force: bool) -> Result<(), String> {
    monitor::kill(pid, force)
}

pub fn run() {
    tauri::Builder::default()
        // Must be registered first. A second launch just brings the first window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let ctl = Arc::new(Control::new());
            monitor::spawn(app.handle().clone(), ctl.clone());
            app.manage(ctl);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Minimising pauses sampling entirely; restoring resumes it.
            if let WindowEvent::Resized(_) = event {
                if let Some(ctl) = window.try_state::<Arc<Control>>() {
                    ctl.set_minimized(window.is_minimized().unwrap_or(false));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_interval,
            set_visible,
            set_want_procs,
            kill_process
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Vanguard");
}
