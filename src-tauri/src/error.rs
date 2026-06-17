use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("PTY error: {0}")]
    Pty(String),

    #[error("I/O error: {0}")]
    Io(String),

    #[error("no compatible shell found on this system")]
    ShellNotFound,

    #[error("PEM file not found: {0}")]
    PemNotFound(String),

    #[error("PEM file not readable: {0}")]
    PemNotReadable(String),

    #[cfg_attr(not(unix), allow(dead_code))]
    #[error("PEM file permissions are too open — only the owner should have read access")]
    PemBadPermissions,

    #[error("PEM file is not a valid private key: {0}")]
    PemInvalidKey(String),

    #[error("SSH host unreachable: {0}")]
    SshHostUnreachable(String),

    #[error("SSH connection timed out after 10 seconds")]
    SshTimeout,

    #[error("SSH authentication failed — key rejected by server")]
    SshAuthFailed,

    #[error("SSH connection failed: {0}")]
    SshConnectionFailed(String),

    #[error("Failed to parse remote metrics output: {0}")]
    MetricsParseFailed(String),

    #[error("Monitor error: {0}")]
    Monitor(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let (code, message) = match self {
            AppError::Pty(msg) => ("PTY_ERROR", msg.clone()),
            AppError::Io(msg) => ("IO_ERROR", msg.clone()),
            AppError::ShellNotFound => ("SHELL_NOT_FOUND", self.to_string()),
            AppError::PemNotFound(path) => ("PEM_NOT_FOUND", path.clone()),
            AppError::PemNotReadable(msg) => ("PEM_NOT_READABLE", msg.clone()),
            AppError::PemBadPermissions => ("PEM_BAD_PERMISSIONS", self.to_string()),
            AppError::PemInvalidKey(msg) => ("PEM_INVALID_KEY", msg.clone()),
            AppError::SshHostUnreachable(msg) => ("SSH_HOST_UNREACHABLE", msg.clone()),
            AppError::SshTimeout => ("SSH_TIMEOUT", self.to_string()),
            AppError::SshAuthFailed => ("SSH_AUTH_FAILED", self.to_string()),
            AppError::SshConnectionFailed(msg) => ("SSH_CONNECTION_FAILED", msg.clone()),
            AppError::MetricsParseFailed(msg) => ("METRICS_PARSE_FAILED", msg.clone()),
            AppError::Monitor(msg) => ("MONITOR_ERROR", msg.clone()),
        };
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", code)?;
        state.serialize_field("message", &message)?;
        state.end()
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}
