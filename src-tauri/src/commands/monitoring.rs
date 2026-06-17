use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::services::monitor_service;
use crate::state::AppState;

/// Starts polling the instance for live metrics over a dedicated SSH
/// connection (independent of the interactive PTY/terminal session).
/// No-op if monitoring is already running.
#[tauri::command]
pub async fn monitor_start(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), AppError> {
    monitor_service::start(&state, app, pem_path, user, host, port.unwrap_or(22))
}

#[tauri::command]
pub async fn monitor_stop(state: State<'_, AppState>) -> Result<(), AppError> {
    monitor_service::stop(&state)
}
