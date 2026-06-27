use tauri::AppHandle;

use crate::error::AppError;
use crate::services::script_fs_service::{self, ScriptFileEntry};
use crate::services::script_log_service::{self, ScriptLogEntry, ScriptLogSummary};
use crate::services::script_remote_service::{self, ScriptRemotePrepareResult, ScriptSyncResult};

#[tauri::command]
pub async fn script_fs_list(dir_path: String) -> Result<Vec<ScriptFileEntry>, AppError> {
    script_fs_service::list_directory(&dir_path).await
}

#[tauri::command]
pub async fn script_fs_read(path: String) -> Result<String, AppError> {
    script_fs_service::read_file(&path).await
}

#[tauri::command]
pub async fn script_fs_write(path: String, content: String) -> Result<(), AppError> {
    script_fs_service::write_file(&path, &content).await
}

#[tauri::command]
pub async fn script_fs_create(
    dir_path: String,
    file_name: String,
) -> Result<ScriptFileEntry, AppError> {
    script_fs_service::create_file(&dir_path, &file_name).await
}

#[tauri::command]
pub async fn script_fs_delete(path: String) -> Result<(), AppError> {
    script_fs_service::delete_file(&path).await
}

/// Renames a local script file in place (same directory). The frontend pairs
/// this with `script_remote_rename` to keep an already-uploaded copy in sync.
#[tauri::command]
pub async fn script_fs_rename(
    path: String,
    new_name: String,
) -> Result<script_fs_service::ScriptFileEntry, AppError> {
    script_fs_service::rename_file(&path, &new_name).await
}

/// Side-channel existence-check + SFTP upload for remote script execution —
/// never touches the interactive PTY (see `spec-terminal.md` § "Architecture
/// Decision: script execution stays on the interactive channel"). Sending the
/// resolved `remote_path` to the terminal is a separate, not-yet-implemented step.
#[tauri::command]
pub async fn script_remote_prepare(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    content: String,
    file_name: String,
    app: AppHandle,
) -> Result<ScriptRemotePrepareResult, AppError> {
    script_remote_service::prepare(
        &pem_path,
        &user,
        &host,
        port.unwrap_or(22),
        &content,
        &file_name,
        app,
    )
    .await
}

/// Best-effort remote cleanup, called alongside local script deletion. A
/// `false` result means the script was never uploaded — not an error.
#[tauri::command]
pub async fn script_remote_delete(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    file_name: String,
) -> Result<bool, AppError> {
    script_remote_service::delete_remote(&pem_path, &user, &host, port.unwrap_or(22), &file_name)
        .await
}

/// Best-effort remote rename, called alongside a local script rename. A
/// `false` result means the script was never uploaded — not an error, and the
/// frontend doesn't need to know in advance whether a remote copy exists.
#[tauri::command]
pub async fn script_remote_rename(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    old_file_name: String,
    new_file_name: String,
) -> Result<bool, AppError> {
    script_remote_service::rename_remote(
        &pem_path,
        &user,
        &host,
        port.unwrap_or(22),
        &old_file_name,
        &new_file_name,
    )
    .await
}

/// Synchronises remote `.deploy-monitor/scripts/` to exactly match the local
/// `scripts_dir` — uploads missing or changed scripts, deletes orphans.
/// Non-fatal per-file failures are silently skipped; only connection-level
/// errors return `Err`. Called once per SSH connection (button or manual).
#[tauri::command]
pub async fn script_sync(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    scripts_dir: String,
) -> Result<ScriptSyncResult, AppError> {
    script_remote_service::sync_scripts(
        &pem_path,
        &user,
        &host,
        port.unwrap_or(22),
        &scripts_dir,
    )
    .await
}

/// Lists run-history summaries (no `output`) from `outputs_dir`, the
/// user-configured logs folder (independent of the scripts root), newest
/// first. An empty vec means no runs yet, not an error.
#[tauri::command]
pub async fn script_log_list(outputs_dir: String) -> Result<Vec<ScriptLogSummary>, AppError> {
    script_log_service::list_logs(&outputs_dir).await
}

/// Reads one run-history entry's full content, including `output`. Called
/// on demand when the user opens a Historial card, not for the whole list.
#[tauri::command]
pub async fn script_log_get(path: String) -> Result<ScriptLogEntry, AppError> {
    script_log_service::get_log(&path).await
}

/// Writes one run-history entry once a terminal-run script finishes. Called
/// by the frontend after `runRemoteScript`'s exit-code promise resolves —
/// `outputs_dir` is the user-configured Historial folder (no shared state to
/// read it from, see `spec-backend.md` § "Global App State"). `status` and
/// `triggered_by` are intentionally not accepted here; the service derives
/// them itself (see `script_log_service::write_log`).
#[tauri::command]
pub async fn script_log_write(
    outputs_dir: String,
    script_name: String,
    started_at: String,
    duration_ms: u64,
    exit_code: i32,
    output: String,
) -> Result<ScriptLogSummary, AppError> {
    script_log_service::write_log(
        &outputs_dir,
        &script_name,
        &started_at,
        duration_ms,
        exit_code,
        &output,
    )
    .await
}
