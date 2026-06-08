use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::state::{AppState, PtySession};

/// Windows-first shell detection: prefer the modern shell, fall back to
/// legacy Windows shells, and finally to the user's Unix shell.
fn detect_shell() -> String {
    for shell in &["pwsh.exe", "powershell.exe", "cmd.exe"] {
        if which::which(shell).is_ok() {
            return shell.to_string();
        }
    }
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

/// Writes the gold prompt configuration for the detected shell so the
/// terminal matches the design system's accent color.
fn inject_prompt(shell: &str, writer: &mut Box<dyn Write + Send>) -> Result<(), AppError> {
    let lower = shell.to_lowercase();
    if lower.contains("powershell") || lower.contains("pwsh") {
        // Sent as ONE typed line so the shell echoes it as a single chunk, then
        // `Clear-Host` emits a clear-screen sequence the renderer already recognizes
        // (see extractClearScreen) and uses to wipe its scrollback: the generic
        // "Windows PowerShell / Copyright..." banner *and* this line's own echo both
        // vanish, leaving just the prompt ready for input.
        // Raw SGR 33 escape codes (not -ForegroundColor) so the prompt color maps to
        // the app's gold accent in the renderer's ANSI emulator regardless of PS
        // version — `-ForegroundColor` emits a console-API color it doesn't map.
        let setup = concat!(
            "Clear-Host; ",
            r#"function prompt { $e = [char]27; Write-Host "$e[33m>$(Get-Location)>$e[0m" -NoNewline; " " }"#,
        );
        writer.write_all(format!("{}\r\n", setup).as_bytes())?;
    } else if lower.contains("bash") || lower.contains("zsh") || lower.contains("sh") {
        let prompt_cmd = r#"PS1='\[\e[33m\]\u@\h:\w\$\[\e[0m\] '"#;
        writer.write_all(format!("{}\n", prompt_cmd).as_bytes())?;
    }
    Ok(())
}

/// Device Status Report query ConPTY/the shell sends on startup (and on
/// redraw) to learn the terminal's cursor position. ConPTY blocks the whole
/// session until *some* terminal answers it — without a reply the shell
/// never becomes interactive (confirmed: session freezes on `\x1b[?25h\x1b[6n`
/// forever, no prompt, no input accepted).
const CPR_QUERY: &[u8] = b"\x1b[6n";

/// Synthetic Cursor Position Report (`\x1b[<row>;<col>R`). The exact position
/// is irrelevant to ConPTY/PSReadLine's startup handshake — only that a
/// well-formed reply arrives so it can stop waiting.
const CPR_REPLY: &[u8] = b"\x1b[1;1R";

/// Reads PTY output on a dedicated OS thread (the `Read` impl is blocking)
/// and emits one `pty:data` event per chunk returned by the kernel.
/// Never accumulates across reads before emitting — each available chunk
/// is forwarded immediately so the terminal feels live.
///
/// Also answers `CPR_QUERY` directly on the PTY writer as soon as it's seen
/// in a chunk — required for ConPTY to complete its startup handshake.
///
/// When `defer_prompt_injection` is set, the prompt setup is also sent here,
/// immediately after the CPR reply (and only once). PowerShell/ConPTY blocks
/// the whole session — and scans incoming bytes for this exact reply pattern —
/// until it arrives; writing the setup string any earlier means it gets
/// consumed mid-scan instead of run as a command, leaving the shell stuck on
/// an incomplete statement (rendered as a perpetual `>>` continuation prompt).
/// Shells without this handshake get the setup written immediately in `spawn`.
fn spawn_reader_thread(
    mut reader: Box<dyn Read + Send>,
    app: AppHandle,
    pty: Arc<Mutex<Option<PtySession>>>,
    shell: String,
    defer_prompt_injection: bool,
) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut prompt_injected = !defer_prompt_injection;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let bytes = &buf[..n];
                    if bytes.windows(CPR_QUERY.len()).any(|w| w == CPR_QUERY) {
                        if let Ok(mut guard) = pty.lock() {
                            if let Some(session) = guard.as_mut() {
                                let _ = session.writer.write_all(CPR_REPLY);
                                let _ = session.writer.flush();

                                if !prompt_injected {
                                    prompt_injected = true;
                                    let _ = inject_prompt(&shell, &mut session.writer);
                                }
                            }
                        }
                    }

                    let chunk = String::from_utf8_lossy(bytes).into_owned();
                    if app.emit("pty:data", chunk).is_err() {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
    });
}

/// Starts a local PTY session running the detected OS shell. No-op if a
/// session is already running.
pub fn spawn(state: &AppState, app: AppHandle, cols: u16, rows: u16) -> Result<(), AppError> {
    let mut guard = state
        .pty
        .lock()
        .map_err(|_| AppError::Pty("PTY state lock poisoned".into()))?;

    if guard.is_some() {
        return Ok(());
    }

    let pty_system = native_pty_system();
    let pair: PtyPair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| AppError::Pty(e.to_string()))?;

    let shell = detect_shell();
    if which::which(&shell).is_err() && !std::path::Path::new(&shell).exists() {
        return Err(AppError::ShellNotFound);
    }

    let cmd = CommandBuilder::new(&shell);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| AppError::Pty(e.to_string()))?;

    // Drop the slave handle in the parent process — only the child should
    // hold it open, otherwise the PTY never signals EOF on shell exit.
    drop(pair.slave);
    let master = pair.master;

    let mut writer = master
        .take_writer()
        .map_err(|e| AppError::Pty(e.to_string()))?;
    let reader = master
        .try_clone_reader()
        .map_err(|e| AppError::Pty(e.to_string()))?;

    // PowerShell answers ConPTY's blocking cursor-position query before it
    // starts reading input as commands — defer the prompt setup to the reader
    // thread so it lands right after that handshake completes (see
    // spawn_reader_thread). Shells that don't perform this handshake get the
    // setup written immediately, as before.
    let lower = shell.to_lowercase();
    let defer_prompt_injection = lower.contains("powershell") || lower.contains("pwsh");
    if !defer_prompt_injection {
        inject_prompt(&shell, &mut writer)?;
    }

    spawn_reader_thread(reader, app, state.pty.clone(), shell.clone(), defer_prompt_injection);

    *guard = Some(PtySession {
        master,
        writer,
        child,
    });

    Ok(())
}

/// Sends raw input bytes to the running PTY.
pub fn write(state: &AppState, data: &str) -> Result<(), AppError> {
    let mut guard = state
        .pty
        .lock()
        .map_err(|_| AppError::Pty("PTY state lock poisoned".into()))?;

    let session = guard
        .as_mut()
        .ok_or_else(|| AppError::Pty("no active PTY session".into()))?;

    session.writer.write_all(data.as_bytes())?;
    session.writer.flush()?;
    Ok(())
}

/// Kills the shell process and clears the session. Safe to call when no
/// session is running.
pub fn kill(state: &AppState) -> Result<(), AppError> {
    let mut guard = state
        .pty
        .lock()
        .map_err(|_| AppError::Pty("PTY state lock poisoned".into()))?;

    if let Some(mut session) = guard.take() {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }

    Ok(())
}
