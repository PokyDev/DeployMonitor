use serde::{Deserialize, Serialize};
use tokio::fs;

use crate::error::AppError;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScriptLogStatus {
    Success,
    Error,
}

/// One run-history entry, mirrored 1:1 with the JSON file on disk.
#[derive(Serialize, Deserialize, Clone)]
pub struct ScriptLogEntry {
    pub script_name: String,
    pub triggered_by: String,
    pub status: ScriptLogStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub exit_code: i32,
    pub output: String,
}

/// Same fields as `ScriptLogEntry` minus `output`, plus `path` so the
/// frontend can later call `get_log` for the one entry it opens.
#[derive(Serialize, Clone)]
pub struct ScriptLogSummary {
    pub path: String,
    pub script_name: String,
    pub triggered_by: String,
    pub status: ScriptLogStatus,
    pub started_at: String,
    pub duration_ms: u64,
    pub exit_code: i32,
}

/// Lists run-history summaries from `outputs_dir`, newest first (filenames
/// are `<started_at>__<script_name>.json`, so a reverse lexicographic sort is
/// already chronological — no index file needed). `outputs_dir` is the
/// user-configured logs folder itself — independent of the scripts root, see
/// `spec-backend.md` § "Script Run History". A missing folder is a normal
/// "no runs yet" state, not an error. A single unparsable file is skipped
/// (logged) rather than failing the whole list, since one corrupt entry
/// shouldn't blank the Historial view.
pub async fn list_logs(outputs_dir: &str) -> Result<Vec<ScriptLogSummary>, AppError> {
    let mut read_dir = match fs::read_dir(outputs_dir).await {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::DirectoryNotReadable(e.to_string())),
    };

    let mut summaries = Vec::new();
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

        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let path_str = path.to_string_lossy().into_owned();

        match read_log(&path_str).await {
            Ok(log) => summaries.push(ScriptLogSummary {
                path: path_str,
                script_name: log.script_name,
                triggered_by: log.triggered_by,
                status: log.status,
                started_at: log.started_at,
                duration_ms: log.duration_ms,
                exit_code: log.exit_code,
            }),
            Err(e) => tracing::warn!("Skipping unreadable run-history log {path_str}: {e}"),
        }
    }

    summaries.sort_by(|a, b| b.path.cmp(&a.path));
    Ok(summaries)
}

/// Reads one run-history entry's full content, including `output`.
pub async fn get_log(path: &str) -> Result<ScriptLogEntry, AppError> {
    read_log(path).await
}

/// Writes one run-history entry as `<outputs_dir>/<started_at>__<script_name>.json`
/// (`started_at` with `:` replaced by `-`, matching the format `list_logs` already
/// expects). `status` is derived from `exit_code` here — the single source of
/// truth, never trusted from the caller — and `triggered_by` is resolved from the
/// local OS session, not passed in: it describes who has the desktop app open, not
/// which SSH user the script ran as remotely. `outputs_dir` is created if it
/// doesn't exist yet, since (unlike the Scripts editor's directory) the user may
/// have configured a logs folder before ever running a script.
pub async fn write_log(
    outputs_dir: &str,
    script_name: &str,
    started_at: &str,
    duration_ms: u64,
    exit_code: i32,
    output: &str,
) -> Result<ScriptLogSummary, AppError> {
    let status = if exit_code == 0 {
        ScriptLogStatus::Success
    } else {
        ScriptLogStatus::Error
    };
    let triggered_by = std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string());

    fs::create_dir_all(outputs_dir)
        .await
        .map_err(|e| AppError::ScriptLogWriteFailed(e.to_string()))?;

    let file_name = format!("{}__{}.json", started_at.replace(':', "-"), script_name);
    let path = std::path::Path::new(outputs_dir).join(&file_name);
    let path_str = path.to_string_lossy().into_owned();

    let entry = ScriptLogEntry {
        script_name: script_name.to_string(),
        triggered_by,
        status,
        started_at: started_at.to_string(),
        duration_ms,
        exit_code,
        output: output.to_string(),
    };

    let bytes = serde_json::to_vec_pretty(&entry)
        .map_err(|e| AppError::ScriptLogWriteFailed(e.to_string()))?;
    fs::write(&path, bytes)
        .await
        .map_err(|e| AppError::ScriptLogWriteFailed(e.to_string()))?;

    Ok(ScriptLogSummary {
        path: path_str,
        script_name: entry.script_name,
        triggered_by: entry.triggered_by,
        status: entry.status,
        started_at: entry.started_at,
        duration_ms: entry.duration_ms,
        exit_code: entry.exit_code,
    })
}

async fn read_log(path: &str) -> Result<ScriptLogEntry, AppError> {
    let bytes = fs::read(path).await.map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::FileNotFound(path.to_string())
        } else {
            AppError::FileNotReadable(e.to_string())
        }
    })?;

    serde_json::from_slice(&bytes).map_err(|e| AppError::ScriptLogReadFailed(e.to_string()))
}
