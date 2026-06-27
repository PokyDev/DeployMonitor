use std::collections::HashMap;

use russh::client::Handle;
use russh_sftp::client::error::Error as SftpError;
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, StatusCode};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::error::AppError;
use crate::services::ssh_connect::{connect_authenticated, SshHandler};

/// Chunk size for uploads — small enough to give the progress bar several
/// real steps even for small scripts, far below any SFTP server's packet limit.
const UPLOAD_CHUNK_SIZE: usize = 32 * 1024;

/// Relative to the SFTP session's default cwd (the account's home directory).
/// Never a literal `~/...` — the SFTP protocol does not shell-expand `~`.
const REMOTE_SCRIPTS_DIR: &str = ".deploy-monitor/scripts";

#[derive(Serialize)]
pub struct ScriptRemotePrepareResult {
    pub remote_path: String,
    pub uploaded: bool,
}

#[derive(Clone, Serialize)]
struct UploadProgressPayload {
    file_name: String,
    percent: f32,
    bytes_uploaded: u64,
    total_bytes: u64,
}

fn map_sftp_error(context: &str, err: SftpError) -> AppError {
    AppError::ScriptUploadFailed(format!("{context}: {err}"))
}

/// The remote file is named exactly like the local one. The local scripts
/// directory is flat and already enforces unique file names
/// (`script_fs_service::create_file` / `rename_file`), so this is a stable,
/// collision-free remote identity that survives content edits — unlike the
/// old content-hash naming, which minted a brand-new remote file on every
/// edit and needed a separate cleanup pass to avoid orphaning the previous
/// one. See `spec-backend.md` § "Script Remote Execution".
fn remote_script_path(file_name: &str) -> String {
    format!("{REMOTE_SCRIPTS_DIR}/{file_name}")
}

/// Opens one short-lived authenticated session (same helper `ssh_test_connection`
/// uses) plus a single SFTP subsystem channel on it — shared by every script
/// remote operation below. Never touches the interactive PTY or the monitor's
/// session.
async fn open_sftp_session(
    pem_path: &str,
    user: &str,
    host: &str,
    port: u16,
) -> Result<(Handle<SshHandler>, SftpSession), AppError> {
    let handle = connect_authenticated(pem_path, user, host, port).await?;

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| AppError::SshConnectionFailed(e.to_string()))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| AppError::SshConnectionFailed(e.to_string()))?;

    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| map_sftp_error("no se pudo iniciar la sesión SFTP", e))?;

    Ok((handle, sftp))
}

async fn close_sftp_session(handle: Handle<SshHandler>, sftp: &SftpSession) {
    let _ = sftp.close().await;
    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "English")
        .await;
}

/// Checks whether a file named `file_name` already exists on the instance
/// with matching content length and uploads it via SFTP if not, emitting
/// `script:upload-progress` as it goes. Verifies the remote file's size
/// afterward before returning.
pub async fn prepare(
    pem_path: &str,
    user: &str,
    host: &str,
    port: u16,
    content: &str,
    file_name: &str,
    app: AppHandle,
) -> Result<ScriptRemotePrepareResult, AppError> {
    let (handle, sftp) = open_sftp_session(pem_path, user, host, port).await?;

    // Idempotent bootstrap — ignore failures (e.g. "already exists"); any
    // real problem (permissions, etc.) will surface on the upload itself.
    let _ = sftp.create_dir(".deploy-monitor").await;
    let _ = sftp.create_dir(REMOTE_SCRIPTS_DIR).await;

    let content_bytes = content.as_bytes();
    let total_bytes = content_bytes.len() as u64;
    let remote_path = remote_script_path(file_name);

    let already_present = match sftp.metadata(remote_path.as_str()).await {
        Ok(meta) => meta.len() == total_bytes,
        Err(SftpError::Status(s)) if s.status_code == StatusCode::NoSuchFile => false,
        Err(e) => return Err(map_sftp_error("no se pudo verificar el script remoto", e)),
    };

    let uploaded = if already_present {
        false
    } else {
        let mut file = sftp
            .create(remote_path.as_str())
            .await
            .map_err(|e| map_sftp_error("no se pudo abrir el archivo remoto", e))?;

        let mut bytes_uploaded: u64 = 0;
        for chunk in content_bytes.chunks(UPLOAD_CHUNK_SIZE) {
            file.write_all(chunk)
                .await
                .map_err(|e| AppError::ScriptUploadFailed(e.to_string()))?;
            bytes_uploaded += chunk.len() as u64;
            let percent = (bytes_uploaded as f32 / total_bytes as f32) * 100.0;
            let _ = app.emit(
                "script:upload-progress",
                UploadProgressPayload {
                    file_name: file_name.to_string(),
                    percent,
                    bytes_uploaded,
                    total_bytes,
                },
            );
        }

        file.shutdown()
            .await
            .map_err(|e| AppError::ScriptUploadFailed(e.to_string()))?;

        true
    };

    // Verifies the file actually landed correctly on the instance.
    let verified = sftp
        .metadata(remote_path.as_str())
        .await
        .map_err(|e| map_sftp_error("no se pudo verificar la subida", e))?;
    if verified.len() != total_bytes {
        return Err(AppError::RemoteCheckFailed(format!(
            "tamaño remoto ({}) no coincide con el contenido subido ({})",
            verified.len(),
            total_bytes
        )));
    }

    let mut perms = FileAttributes::empty();
    perms.permissions = Some(0o755);
    let _ = sftp.set_metadata(remote_path.as_str(), perms).await;

    close_sftp_session(handle, &sftp).await;

    Ok(ScriptRemotePrepareResult {
        remote_path,
        uploaded,
    })
}

/// Removes `file_name` from the instance if present — a no-op (returns
/// `Ok(false)`) when it was never uploaded there. Called as a best-effort
/// cleanup alongside local script deletion; the caller does not block local
/// deletion on this succeeding.
pub async fn delete_remote(
    pem_path: &str,
    user: &str,
    host: &str,
    port: u16,
    file_name: &str,
) -> Result<bool, AppError> {
    let (handle, sftp) = open_sftp_session(pem_path, user, host, port).await?;

    let remote_path = remote_script_path(file_name);

    let existed = match sftp.metadata(remote_path.as_str()).await {
        Ok(_) => true,
        Err(SftpError::Status(s)) if s.status_code == StatusCode::NoSuchFile => false,
        Err(e) => return Err(map_sftp_error("no se pudo verificar el script remoto", e)),
    };

    if existed {
        sftp.remove_file(remote_path.as_str()).await.map_err(|e| {
            AppError::RemoteDeleteFailed(format!("no se pudo eliminar el script remoto: {e}"))
        })?;
    }

    close_sftp_session(handle, &sftp).await;

    Ok(existed)
}

#[derive(Serialize)]
pub struct ScriptSyncResult {
    pub uploaded: Vec<String>,
    pub deleted: Vec<String>,
    pub unchanged: u32,
}

/// Synchronises the remote `.deploy-monitor/scripts/` directory to exactly
/// match the local `scripts_dir`. Local is the source of truth:
///  - Scripts present locally but missing (or with differing content) on the
///    remote are uploaded.
///  - Scripts present remotely but absent locally are deleted.
/// Opens a single SFTP session for all operations. Individual file failures
/// are skipped rather than aborting the whole sync — the caller receives a
/// summary of what succeeded.
pub async fn sync_scripts(
    pem_path: &str,
    user: &str,
    host: &str,
    port: u16,
    scripts_dir: &str,
) -> Result<ScriptSyncResult, AppError> {
    // 1. Read all local scripts.
    let mut local_scripts: HashMap<String, Vec<u8>> = HashMap::new();
    let mut dir = tokio::fs::read_dir(scripts_dir).await.map_err(|e| {
        AppError::ScriptSyncFailed(format!("no se pudo leer el directorio local: {e}"))
    })?;
    while let Some(entry) = dir.next_entry().await.map_err(|e| {
        AppError::ScriptSyncFailed(format!("error leyendo entradas del directorio: {e}"))
    })? {
        let ft = entry.file_type().await.map_err(|e| {
            AppError::ScriptSyncFailed(format!("error obteniendo tipo de archivo: {e}"))
        })?;
        if !ft.is_file() {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            match tokio::fs::read(entry.path()).await {
                Ok(bytes) => {
                    local_scripts.insert(name.to_string(), bytes);
                }
                Err(_) => continue,
            }
        }
    }

    // 2. Open a single SFTP session for all remote operations.
    let (handle, sftp) = open_sftp_session(pem_path, user, host, port).await?;

    // 3. Ensure the remote scripts directory exists.
    let _ = sftp.create_dir(".deploy-monitor").await;
    let _ = sftp.create_dir(REMOTE_SCRIPTS_DIR).await;

    // 4. List the remote directory.
    let remote_entries: HashMap<String, u64> = match sftp.read_dir(REMOTE_SCRIPTS_DIR).await {
        Ok(read_dir) => read_dir
            .filter(|e| e.file_type().is_file())
            .map(|e| (e.file_name(), e.metadata().len()))
            .collect(),
        Err(SftpError::Status(s)) if s.status_code == StatusCode::NoSuchFile => HashMap::new(),
        Err(e) => {
            close_sftp_session(handle, &sftp).await;
            return Err(AppError::ScriptSyncFailed(format!(
                "no se pudo listar scripts remotos: {e}"
            )));
        }
    };

    let mut uploaded: Vec<String> = Vec::new();
    let mut deleted: Vec<String> = Vec::new();
    let mut unchanged: u32 = 0;

    // 5. Upload loop — local is source of truth.
    for (name, local_bytes) in &local_scripts {
        let remote_path = remote_script_path(name);
        let local_size = local_bytes.len() as u64;

        let needs_upload = match remote_entries.get(name) {
            None => true,
            Some(&remote_size) if remote_size != local_size => true,
            Some(_) => {
                // Same size — download remote content and compare byte-for-byte.
                match sftp.open(remote_path.as_str()).await {
                    Ok(mut remote_file) => {
                        let mut remote_bytes = Vec::new();
                        match remote_file.read_to_end(&mut remote_bytes).await {
                            Ok(_) => remote_bytes != *local_bytes,
                            Err(_) => true,
                        }
                    }
                    Err(_) => true,
                }
            }
        };

        if !needs_upload {
            unchanged += 1;
            continue;
        }

        let upload_ok = async {
            let mut file = sftp.create(remote_path.as_str()).await?;
            for chunk in local_bytes.chunks(UPLOAD_CHUNK_SIZE) {
                file.write_all(chunk).await?;
            }
            file.shutdown().await?;

            let mut perms = FileAttributes::empty();
            perms.permissions = Some(0o755);
            let _ = sftp.set_metadata(remote_path.as_str(), perms).await;

            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        }
        .await;

        if upload_ok.is_ok() {
            uploaded.push(name.clone());
        }
    }

    // 6. Delete loop — remove remote files absent from local.
    for name in remote_entries.keys() {
        if !local_scripts.contains_key(name) {
            let remote_path = remote_script_path(name);
            if sftp.remove_file(remote_path.as_str()).await.is_ok() {
                deleted.push(name.clone());
            }
        }
    }

    close_sftp_session(handle, &sftp).await;

    Ok(ScriptSyncResult {
        uploaded,
        deleted,
        unchanged,
    })
}

/// Renames `old_file_name` to `new_file_name` on the instance if the old one
/// is present — a no-op (returns `Ok(false)`) when the script was never
/// uploaded there, so the frontend can call this unconditionally on every
/// local rename without first having to know whether a remote copy exists.
/// If something is already sitting at `new_file_name` (e.g. a leftover from a
/// since-deleted script that once had this name), it's cleared first — SFTP
/// `rename` fails if the destination already exists.
pub async fn rename_remote(
    pem_path: &str,
    user: &str,
    host: &str,
    port: u16,
    old_file_name: &str,
    new_file_name: &str,
) -> Result<bool, AppError> {
    let (handle, sftp) = open_sftp_session(pem_path, user, host, port).await?;

    let old_path = remote_script_path(old_file_name);
    let new_path = remote_script_path(new_file_name);

    let existed = match sftp.metadata(old_path.as_str()).await {
        Ok(_) => true,
        Err(SftpError::Status(s)) if s.status_code == StatusCode::NoSuchFile => false,
        Err(e) => return Err(map_sftp_error("no se pudo verificar el script remoto", e)),
    };

    if existed {
        let _ = sftp.remove_file(new_path.as_str()).await;
        sftp.rename(old_path.as_str(), new_path.as_str())
            .await
            .map_err(|e| {
                AppError::RemoteRenameFailed(format!("no se pudo renombrar el script remoto: {e}"))
            })?;
    }

    close_sftp_session(handle, &sftp).await;

    Ok(existed)
}
