use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::services::pty_service;
use crate::state::AppState;

#[tauri::command]
pub async fn pty_start(
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), AppError> {
    pty_service::spawn(&state, app, cols, rows)
}

#[tauri::command]
pub async fn pty_write(data: String, state: State<'_, AppState>) -> Result<(), AppError> {
    pty_service::write(&state, &data)
}

#[tauri::command]
pub async fn pty_stop(state: State<'_, AppState>) -> Result<(), AppError> {
    pty_service::kill(&state)
}
