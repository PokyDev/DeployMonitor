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
