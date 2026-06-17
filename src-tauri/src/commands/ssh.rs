use serde::Serialize;
use std::time::Instant;

use crate::error::AppError;
use crate::services::ssh_connect::connect_authenticated;

#[derive(Serialize)]
pub struct TestResult {
    pub latency_ms: u64,
}

#[tauri::command]
pub async fn ssh_test_connection(
    pem_path: String,
    user: String,
    host: String,
    port: Option<u16>,
) -> Result<TestResult, AppError> {
    let port = port.unwrap_or(22);
    let start = Instant::now();

    let handle = connect_authenticated(&pem_path, &user, &host, port).await?;

    let _ = handle
        .disconnect(russh::Disconnect::ByApplication, "", "English")
        .await;

    Ok(TestResult {
        latency_ms: start.elapsed().as_millis() as u64,
    })
}
