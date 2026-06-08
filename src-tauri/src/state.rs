use std::io::Write;
use std::sync::{Arc, Mutex};

use portable_pty::{Child, MasterPty};

/// A live local PTY session: the master side, the writer half (for sending
/// input), and the spawned shell child process.
pub struct PtySession {
    /// Never read directly — held only so the master stays open for the
    /// session's lifetime. Dropping it would close the PTY out from under
    /// the writer/reader handles derived from it.
    #[allow(dead_code)]
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

#[derive(Default)]
pub struct AppState {
    pub pty: Arc<Mutex<Option<PtySession>>>,
}
