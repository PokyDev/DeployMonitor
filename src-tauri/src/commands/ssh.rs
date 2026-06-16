use async_trait::async_trait;
use russh::client;
use russh_keys::key::PublicKey;
use serde::Serialize;
use std::{path::Path, sync::Arc, time::Instant};
use tokio::time::{timeout, Duration};

use crate::error::AppError;

#[derive(Serialize)]
pub struct TestResult {
    pub latency_ms: u64,
}

struct TestHandler;

#[async_trait]
impl client::Handler for TestHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

#[tauri::command]
pub async fn ssh_test_connection(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
) -> Result<TestResult, AppError> {
    let port = port.unwrap_or(22);
    let path = Path::new(&pem_path);

    // 1. File existence
    if !path.exists() {
        return Err(AppError::PemNotFound(pem_path));
    }

    // 2. Readability (catches PermissionDenied before attempting parse)
    let key_data = std::fs::read_to_string(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            AppError::PemNotReadable(format!("Permiso denegado: {pem_path}"))
        } else {
            AppError::PemNotReadable(e.to_string())
        }
    })?;

    // 3. Unix permission check — SSH rejects keys accessible to group/others
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path).map_err(|e| AppError::PemNotReadable(e.to_string()))?;
        if meta.permissions().mode() & 0o077 != 0 {
            return Err(AppError::PemBadPermissions);
        }
    }

    // 4. Parse the private key
    let key_pair = russh_keys::decode_secret_key(&key_data, None)
        .map_err(|e| AppError::PemInvalidKey(e.to_string()))?;

    // 5. TCP connect + SSH handshake with hard timeout
    let config = Arc::new(client::Config::default());
    let start = Instant::now();

    let connect_result = timeout(
        Duration::from_secs(12),
        client::connect(config, (host.as_str(), port), TestHandler),
    )
    .await;

    let mut handle = match connect_result {
        Err(_) => return Err(AppError::SshTimeout),
        Ok(Err(e)) => {
            return Err(AppError::SshHostUnreachable(format!(
                "{}:{} — {}",
                host, port, e
            )))
        }
        Ok(Ok(h)) => h,
    };

    // 6. Public key authentication
    let authenticated = handle
        .authenticate_publickey(user.as_str(), Arc::new(key_pair))
        .await
        .map_err(|_| AppError::SshAuthFailed)?;

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "English")
        .await;

    if !authenticated {
        return Err(AppError::SshAuthFailed);
    }

    Ok(TestResult {
        latency_ms: start.elapsed().as_millis() as u64,
    })
}
