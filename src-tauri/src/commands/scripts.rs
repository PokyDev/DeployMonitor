use tauri::AppHandle;

use crate::error::AppError;
use crate::services::script_fs_service::{self, ScriptFileEntry};
use crate::services::script_remote_service::{self, ScriptRemotePrepareResult};

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

/// Side-channel existence-check + SFTP upload for remote script execution —
/// never touches the interactive PTY (see `spec-terminal.md` § "Architecture
/// Decision: script execution stays on the interactive channel"). Sending the
/// resolved `remote_path` to the terminal is a separate, not-yet-implemented step.
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command signatures are generated"
)]
pub async fn script_remote_prepare(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
    content: String,
    content_hash: String,
    extension: String,
    app: AppHandle,
) -> Result<ScriptRemotePrepareResult, AppError> {
    script_remote_service::prepare(
        &pem_path,
        &user,
        &host,
        port.unwrap_or(22),
        &content,
        &content_hash,
        &extension,
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
    content_hash: String,
    extension: String,
) -> Result<bool, AppError> {
    script_remote_service::delete_remote(
        &pem_path,
        &user,
        &host,
        port.unwrap_or(22),
        &content_hash,
        &extension,
    )
    .await
}
