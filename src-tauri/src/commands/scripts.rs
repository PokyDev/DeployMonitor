use crate::error::AppError;
use crate::services::script_fs_service::{self, ScriptFileEntry};

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
