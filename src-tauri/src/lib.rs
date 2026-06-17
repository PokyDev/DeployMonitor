mod commands;
mod error;
mod services;
mod state;

use tauri::Manager;

use commands::pty::{pty_resize, pty_start, pty_stop, pty_write};
use commands::ssh::ssh_test_connection;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty_start, pty_write, pty_resize, pty_stop,
            ssh_test_connection
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<AppState>();
                let _ = services::pty_service::kill(&state);
            }
        });
}
