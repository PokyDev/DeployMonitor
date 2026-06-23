# spec-terminal.md

Terminal implementation spec for DeployMonitor.
Covers **two modes**: local PTY shell and interactive SSH shell.
Both render in the same `terminal-panel.tsx` component.

---

## Two Terminal Modes

| Mode | Description | Backend |
|---|---|---|
| `local` | Full interactive shell on the user's machine | `portable-pty` — spawns real OS shell |
| `ssh` | Full interactive shell inside the remote instance | `russh` PTY + shell channel |

The frontend component is identical for both modes. The difference is entirely in the Rust backend — which process/channel provides the PTY.

---

## Architecture

```
terminal-panel.tsx
       │
       ├── keydown → escape sequences → pty_write (local) or ssh_pty_write (ssh)
       │
       ├── listen("pty:data")     ← local PTY output chunks
       └── listen("ssh:pty-data") ← SSH PTY output chunks
```

Both output events feed the same `xterm.js` `Terminal` instance (see decision below).

---

## Architecture Decision: xterm.js (2026-06-11)

**Decision:** The frontend renders PTY/SSH output through `@xterm/xterm` + `@xterm/addon-fit`, not a custom ANSI parser. The Rust backend (`portable-pty`, `russh` PTY channel, all Tauri commands/events in this spec) is **unchanged** — it still emits raw byte chunks on `pty:data` / `ssh:pty-data`. Only the frontend consumer of those events changed.

**Why this changed:** The previous implementation parsed only SGR color codes (`SGR_MAP`) into HTML. It had no support for cursor positioning or the alt-screen buffer, so any interactive program — `vim`, `htop`, `less`, `nano`, `top`, package-manager menus — rendered as scrolling garbage instead of a redrawn screen. Building a complete VT100/VT220 emulator from scratch was assessed as a multi-month effort, which blocks the goal of shipping a usable terminal for the beta. `xterm.js` is the same approach VS Code, Hyper, and Theia use (mature VT100/VT220 emulator + PTY backend) and is a pure JS/DOM library — fully compatible with Tauri's webview (WebView2 / WebKitGTK), no native bindings required.

**What this means for an agent working in this codebase:**
- If you see references to `ANSI-to-HTML converter`, `SGR_MAP`, `outputChunks` array, or `keyToEscapeSequence` in old code/commits, these are **superseded** — do not extend them, migrate them to the `xterm.js` patterns below.
- Do not reintroduce a custom ANSI/VT100 parser. `xterm.js` is an intentional, accepted third-party dependency for this specific purpose — it does not violate the "no third-party ANSI library" guidance that predates this decision (that guidance is now obsolete).
- Script automation output is **not** a separate rendering target — see "Architecture Decision: script execution stays on the interactive channel" below. Do not build a second `Terminal` instance (read-only or otherwise) for it.

---

## Architecture Decision: script execution stays on the interactive channel (2026-06-22)

**Decision:** Running a script does not open a second terminal, a read-only output viewer, or a separate PTY/exec channel for its output. The already-open interactive terminal (local PTY → `ssh` subprocess, see the status note under "Backend: SSH Terminal" below) is the only place script output is ever rendered. The backend only ever writes **one line** to that PTY to start a run — a plain shell command referencing a file that is already sitting on the remote instance, e.g.:

```
bash ~/.deploy-monitor/scripts/<file-name>; printf '\033]633;DM-DONE;%s\007' "$?"
```

Everything needed *before* that line is sent — checking whether the script already exists on the instance, and uploading it if not — happens over a separate, invisible side-channel: a short-lived authenticated `russh` session opened the same way `monitor_service.rs` already does for metrics polling (`connect_authenticated` + exec channel / SFTP). That side-channel never emits `pty:data` and never touches xterm.js. See `spec-backend.md` § "Script Remote Execution" for the Rust-side design.

**Why this changed:** Two prior approaches were tried and rolled back the same day, both because they leaked visible noise into the user's terminal:
1. Piping the script's content as a base64 blob through the *interactive* PTY (`ptyWrite`) and decoding it remotely ("Script Launch Prototype"). The remote tty echoes back anything written to it exactly as if the user had typed it — there is no way to inject a multi-line payload on this channel invisibly.
2. Wrapping that same injection in `stty -echo` / `stty echo` plus an OSC end-marker. This hid the echo but not the artifacts of the multi-line assignment itself (stray blank lines from the chunked base64 variable), and the script's own output still didn't read like normal terminal output.

Both failed for the same underlying reason: anything written to the interactive PTY is indistinguishable from user keystrokes, so there is no clean way to inject a *payload* through it — only commands. The fix is to stop sending a payload at all: upload the file out-of-band first, then send a normal one-line command. There is nothing left to leak.

**What this means for an agent working in this codebase:**
- Do not reintroduce base64-over-`ptyWrite` injection, `stty -echo` bracketing, or any multi-line write to the interactive PTY for running a script. If you see `script-run-utils.ts`, `matchScriptRunEnd`, or `SCRIPT_RUN_CARRY_LENGTH` referenced in old commits, these are **superseded** — do not resurrect them.
- Do not build a second `Terminal` instance for script output, read-only or otherwise. Script output is just more `pty:data` flowing into the same `Terminal` instance the user is already looking at.
- The OSC end-marker technique (`\033]<id>;payload\007`) is still valid — xterm.js silently discards unrecognized OSC sequences, so it's the right way to signal "run finished, exit code N" back to the frontend without printing visible text. It is now appended **after** the single command line, not used to bracket a multi-line injection.
- The upload/existence-check side-channel runs over `russh`, completely separate from the local-PTY-based interactive terminal. Reuse `connect_authenticated` (`ssh_connect.rs`) — do not open a second local PTY or a second `ssh` subprocess for this.

**Status: implemented (2026-06-23).** `runRemoteScript(remotePath)` (`src/stores/use-terminal-store.ts`) sends `bash <remotePath>; printf '\033]633;DM-DONE;%s\007' "$?"\r` via `write()` and returns a promise that resolves with the exit code. **Detection of the OSC 633 marker uses xterm.js's own parser API — `term.parser.registerOscHandler(633, callback)` (registered once in `terminal.tsx`'s term-creation effect) — not a regex scan over raw `pty:data` chunk text.** This was a deliberate deviation from a literal reading of this spec: the marker can legitimately arrive split across two `pty:data` chunks (nothing guarantees an escape sequence lands in one Tauri event), and xterm's VT parser is a real state machine that already reassembles sequences split across `write()` calls — reimplementing that with a manual carry-buffer would just be a worse copy of code xterm already ships. The handler's callback forwards the parsed exit code to the terminal store via a single-slot `scriptDoneCb` (same pattern as `sshConnectedCb`/`sshFailedCb`/`sshExitCb`), which `runRemoteScript` registers and resolves on. If `sshConnected` flips to `false` before the marker arrives, `runRemoteScript` rejects instead of hanging forever — there is no other timeout, since a script may legitimately run for a long time.

---

## Frontend: `terminal-panel.tsx`

### Rendering engine: xterm.js

The terminal container hosts one `@xterm/xterm` `Terminal` instance per session — the local PTY, each SSH session, and each read-only script-output viewer all get their own instance. The container is still a plain `<div>` (xterm.js attaches its own canvas/DOM nodes to it via `term.open()`) — never a `<textarea>` or `<input>`.

```typescript
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const term = new Terminal({
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  lineHeight: 1.5,
  scrollback: 5000,
  disableStdin: readOnly, // true for script-output viewers
  theme: buildTheme(),    // see Theming below
})
const fitAddon = new FitAddon()
term.loadAddon(fitAddon)
term.open(containerRef.current)
fitAddon.fit()
```

Dispose on unmount: `term.dispose()`. Without this, repeated mount/unmount (route changes, tab close) leaks listeners and DOM nodes.

### Input handling

xterm.js owns keyboard capture once `term.open()` is called. Do not attach a manual `keydown` handler or an escape-sequence map — xterm.js's input encoder already translates arrow keys, Ctrl+combinations, function keys, etc. into the correct VT sequences.

```typescript
term.onData((data) => {
  invoke('pty_write', { data }) // or ssh_pty_write for SSH mode
})
```

### Output rendering

```typescript
await listen<string>('pty:data', (event) => {
  term.write(event.payload)
})
```

`term.write()` takes the raw chunk directly — there is no HTML conversion step and no manual `outputChunks` array. xterm.js's built-in VT100/VT220 parser handles cursor movement, the alt-screen buffer (`vim`, `htop`, `less`, `nano`), scrollback, and SGR color codes natively. Scrollback length is controlled by the `scrollback` option (5000 lines) — do not reintroduce a separate chunk array to cap history, it would duplicate state xterm.js already owns.

### Theming

Map the design system's palette to xterm.js's `ITheme` when constructing each `Terminal`. This is where the SGR-color intent from the old `SGR_MAP` now lives:

```typescript
function buildTheme(): ITheme {
  return {
    background: '#0D0D0D',  // hardcoded — terminal bg is exempt from theme, per CLAUDE.md
    foreground: '#D4D0C4',  // SGR 0 (reset/default)
    yellow: '#D4AF37',      // SGR 33 — gold, prompt/commands
    green: '#3D9E68',       // SGR 32 — success
    red: '#C4394D',         // SGR 31 — error
    blue: '#2874A6',        // SGR 34 — info
    brightBlack: '#555555', // SGR 90 — muted
  }
}
```

If a future theme needs to read from `tokens.css`, resolve the values via `getComputedStyle(document.documentElement)` at construction time — `ITheme` only accepts static color strings, not CSS custom properties.

### Resize handling

```typescript
useEffect(() => {
  const observer = new ResizeObserver(() => {
    fitAddon.fit()
    const { cols, rows } = term
    invoke('pty_resize', { cols, rows }) // or ssh_pty_resize for SSH mode
  })
  observer.observe(containerRef.current)
  return () => observer.disconnect()
}, [])
```

`FitAddon.fit()` measures the container and resizes the `Terminal` instance internally — read the resulting `cols`/`rows` directly from `term` afterward. There is no manual character-dimension measurement.

### Script automation output

Superseded — see "Architecture Decision: script execution stays on the interactive channel" near the top of this file. Script output is not rendered by a separate component; it arrives as ordinary `pty:data` chunks into the same `Terminal` instance already on screen, exactly like anything else the shell prints.

### StrictMode guard

Module-level boolean still required for event listener registration — unchanged pattern, now writing to the `Terminal` instance instead of an `outputChunks` array:

```typescript
// Module-level — prevents double-registration in React StrictMode
let _terminalListening = false

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  init: async () => {
    if (_terminalListening) return
    _terminalListening = true

    await listen<string>('pty:data', (event) => {
      get().terminal?.write(event.payload)
    })
  },
}))
```

---

## Backend: Local PTY (`src-tauri/src/commands/pty.rs`)

### Crate

```toml
# Cargo.toml
portable-pty = "0.8"
```

### Shell detection (Windows-first, cross-platform)

```rust
fn detect_shell() -> String {
    // Windows: prefer modern shell
    for shell in &["pwsh.exe", "powershell.exe", "cmd.exe"] {
        if which::which(shell).is_ok() {
            return shell.to_string();
        }
    }
    // Unix fallback
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}
```

### PTY commands

```rust
#[tauri::command]
pub async fn pty_start(
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String>

#[tauri::command]
pub async fn pty_write(data: String, state: State<'_, AppState>) -> Result<(), String>

#[tauri::command]
pub async fn pty_resize(cols: u16, rows: u16, state: State<'_, AppState>) -> Result<(), String>

#[tauri::command]
pub async fn pty_stop(state: State<'_, AppState>) -> Result<(), String>
```

### Golden prompt injection

After spawning the PTY, write the prompt configuration before returning:

```rust
// For bash/zsh — injects gold PS1
let prompt_cmd = r#"PS1='\[\e[33m\]\u@\h:\w\$\[\e[0m\] '"#;
pty_writer.write_all(format!("{}\n", prompt_cmd).as_bytes())?;

// For PowerShell — injects gold prompt function
let prompt_cmd = r#"function prompt { Write-Host "$env:USERNAME@$env:COMPUTERNAME $(Get-Location)>" -NoNewline -ForegroundColor Yellow; " " }"#;
pty_writer.write_all(format!("{}\r\n", prompt_cmd).as_bytes())?;
```

### Buffer drain rule

```rust
// CORRECT — drain once after loop, never inside
let mut buffer = Vec::new();
loop {
    match reader.read(&mut tmp) {
        Ok(0) | Err(_) => break,
        Ok(n) => buffer.extend_from_slice(&tmp[..n]),
    }
}
// emit once here
app.emit("pty:data", String::from_utf8_lossy(&buffer).to_string())?;
```

---

## Backend: SSH Terminal (`src-tauri/src/ssh/`)

> ⚠ **Status: aspirational, not implemented.** The module path, the `ssh_pty_*` Tauri commands, and the `russh` PTY+shell channel described in this section do not exist in the current codebase. The real interactive SSH session today is the **local PTY** described under "Backend: Local PTY" above, running the system `ssh` binary as a subprocess — see `src-tauri/src/services/pty_service.rs` and `src/lib/ssh-utils.ts` (connection state is detected heuristically from output text, not from a `russh` session object). This section documents a possible future direction; do not implement `ssh_pty_*` against it without confirming with the user first. The part of this page that **is** real and current today: the exec-channel pattern in `src-tauri/src/services/monitor_service.rs` (`connect_authenticated` + `channel_open_session().exec()`) — the script-execution side-channel follows the same pattern (see "Architecture Decision: script execution stays on the interactive channel" above, and `spec-backend.md` § "Script Remote Execution").

### Channel separation — critical rule

```
Interactive terminal  →  local PTY running `ssh` as a subprocess (current reality)
                          PTY + shell channel via russh (aspirational, not implemented)
Discrete commands     →  exec channel via russh (real — see monitor_service.rs)
Script execution      →  stays on the interactive channel as a single command line, no payload.
                          Existence-check + upload run over their own exec/SFTP channel,
                          separate from the interactive one and never streamed to the user.
```

Injecting a payload (script content, base64, etc.) into the interactive channel is exactly the bug this redesign fixes — see the Architecture Decision above.

### SSH PTY channel setup

```rust
// In ssh/client.rs — establish interactive shell session
pub async fn open_shell_channel(
    session: &mut Handle<Handler>,
    cols: u32,
    rows: u32,
) -> Result<Channel<Msg>, AppError> {
    let mut channel = session.channel_open_session().await?;

    // Request PTY before requesting shell
    channel.request_pty(
        false,
        "xterm-256color",  // terminal type
        cols, rows,
        0, 0,              // pixel dimensions (not used)
        &[],               // terminal modes
    ).await?;

    channel.request_shell(false).await?;
    Ok(channel)
}
```

### SSH PTY commands (Tauri commands)

Parallel structure to local PTY:

```rust
#[tauri::command]
pub async fn ssh_pty_start(instance_id: String, cols: u16, rows: u16, ...) -> Result<(), String>

#[tauri::command]
pub async fn ssh_pty_write(instance_id: String, data: String, ...) -> Result<(), String>

#[tauri::command]
pub async fn ssh_pty_resize(instance_id: String, cols: u16, rows: u16, ...) -> Result<(), String>

#[tauri::command]
pub async fn ssh_pty_stop(instance_id: String, ...) -> Result<(), String>
```

SSH PTY output emits on `ssh:pty-data` — same shape as `pty:data` for the frontend.

### SSH exec channel (non-interactive commands)

```rust
// In ssh/executor.rs — for discrete commands, NOT for interactive terminal
pub async fn run_command(
    session: &Handle<Handler>,
    cmd: &str,
) -> Result<CommandOutput, AppError> {
    let mut channel = session.channel_open_session().await?;
    channel.exec(true, cmd).await?;

    let mut stdout = Vec::new();
    let mut stderr = Vec::new();

    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => stdout.extend_from_slice(&data),
            Some(ChannelMsg::ExtendedData { data, .. }) => stderr.extend_from_slice(&data),
            Some(ChannelMsg::ExitStatus { exit_status }) => {
                return Ok(CommandOutput {
                    stdout: String::from_utf8_lossy(&stdout).to_string(),
                    stderr: String::from_utf8_lossy(&stderr).to_string(),
                    exit_code: exit_status as i32,
                })
            }
            None => break,
            _ => {}
        }
    }

    Err(AppError::SshConnectionFailed("channel closed without exit status".into()))
}
```

---

## Terminal Panel UI

### Visual spec

- Background: **always `#0D0D0D`** — hardcoded, never a token (exempt from theme)
- Font: `JetBrains Mono` 400, 13px, line-height 1.5
- Scrollbar: 4px, `--border-default` color, `--border-strong` on hover
- Panel header: mode badge + tabs for multiple sessions

### Mode badges

```
[LOCAL]  → gray (#555555)
[SSH]    → gold (#D4AF37, pulsing)
```

### Connection status in terminal

On SSH connect success: display a brief system message in gold:
```
─── Connected to user@host ────────────────────────
```

On disconnect:
```
─── Session closed ────────────────────────────────
```

These are frontend-generated ANSI strings injected into the output buffer — not from the backend.

---

## Tauri Commands Reference

| Command | Direction | Description |
|---|---|---|
| `pty_start` | invoke | Start local PTY with given dimensions |
| `pty_write` | invoke | Send input data to local PTY |
| `pty_resize` | invoke | Resize local PTY |
| `pty_stop` | invoke | Kill local PTY process |
| `ssh_pty_start` | invoke | Start SSH interactive shell channel |
| `ssh_pty_write` | invoke | Send input to SSH PTY |
| `ssh_pty_resize` | invoke | Resize SSH PTY |
| `ssh_pty_stop` | invoke | Close SSH PTY channel |
| `pty:data` | event | Local PTY output chunk |
| `ssh:pty-data` | event | SSH PTY output chunk |

---

## Known Issues and Guards

**React StrictMode double-mount:** Module-level `_terminalListening` boolean prevents double event listener registration. Do not use `useRef` for this — module scope is required.

**Windows shell detection:** `pwsh.exe` (PowerShell 7+) is preferred over `powershell.exe` (Windows PowerShell 5.1). Detect by attempting `which::which` on each in order.

**SSH welcome banner:** The welcome banner (MOTD) appears on the PTY+shell channel naturally. Do not attempt to suppress it — it's part of the interactive experience.

**PTY dimensions on first render:** Call `pty_resize` after the terminal container has been painted (in a `useEffect` with the container ref dependency), not during initial mount. With xterm.js, call `fitAddon.fit()` first and derive `cols`/`rows` from `term` — `fit()` on a zero-size container (e.g. `display: none` parent) produces `1x1` and must be re-run once the container has real dimensions.

**xterm.js CSS import:** `@xterm/xterm/css/xterm.css` must be imported once (e.g. in the terminal panel component). Without it, the terminal renders unstyled/invisible.

**Terminal instance lifecycle:** Call `term.dispose()` on unmount. Each `Terminal` instance attaches DOM nodes and internal listeners to its container — skipping disposal leaks on every mount/unmount cycle (tab close, route change).