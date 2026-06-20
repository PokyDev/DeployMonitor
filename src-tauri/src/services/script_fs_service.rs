use std::path::{Path, PathBuf};

use serde::Serialize;
use tokio::fs;

use crate::error::AppError;

#[derive(Serialize, Clone)]
pub struct ScriptFileEntry {
    pub name: String,
    pub path: String,
}

/// Lists files directly inside `dir` — non-recursive, subdirectories are
/// skipped rather than erroring — sorted by name.
pub async fn list_directory(dir: &str) -> Result<Vec<ScriptFileEntry>, AppError> {
    let mut read_dir = fs::read_dir(Path::new(dir)).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::DirectoryNotFound(dir.to_string())
        } else {
            AppError::DirectoryNotReadable(e.to_string())
        }
    })?;

    let mut entries = Vec::new();
    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| AppError::DirectoryNotReadable(e.to_string()))?
    {
        let file_type = entry
            .file_type()
            .await
            .map_err(|e| AppError::DirectoryNotReadable(e.to_string()))?;
        if !file_type.is_file() {
            continue;
        }
        entries.push(ScriptFileEntry {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: entry.path().to_string_lossy().into_owned(),
        });
    }

    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Reads a file's content as UTF-8 text. Binary/non-UTF-8 files are
/// rejected explicitly instead of being silently mangled into the editor.
pub async fn read_file(path: &str) -> Result<String, AppError> {
    let bytes = fs::read(path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::FileNotFound(path.to_string())
        } else {
            AppError::FileNotReadable(e.to_string())
        }
    })?;

    String::from_utf8(bytes).map_err(|_| AppError::FileNotUtf8(path.to_string()))
}

/// Overwrites a file's content. Shared by manual save and autosave.
pub async fn write_file(path: &str, content: &str) -> Result<(), AppError> {
    fs::write(path, content)
        .await
        .map_err(|e| AppError::FileWriteFailed(e.to_string()))
}

/// Validates `file_name` and creates an empty file inside `dir`. Rejects
/// empty names and path separators/`..` so the new file can't escape `dir`.
pub async fn create_file(dir: &str, file_name: &str) -> Result<ScriptFileEntry, AppError> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidFileName(
            "el nombre no puede estar vacío".to_string(),
        ));
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(AppError::InvalidFileName(trimmed.to_string()));
    }

    let path: PathBuf = Path::new(dir).join(trimmed);

    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                AppError::FileAlreadyExists(trimmed.to_string())
            } else {
                AppError::FileWriteFailed(e.to_string())
            }
        })?;

    Ok(ScriptFileEntry {
        name: trimmed.to_string(),
        path: path.to_string_lossy().into_owned(),
    })
}
