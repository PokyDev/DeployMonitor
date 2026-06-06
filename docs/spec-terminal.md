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

Both output events feed the same ANSI-to-HTML pipeline and the same output chunk array.

---

## Frontend: `terminal-panel.tsx`

### Input handling

The terminal container is a `<div>` with `tabIndex={0}`, never a `<textarea>` or `<input>`. Capture raw keyboard events at the `keydown` level.

```typescript
const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
  e.preventDefault()
  const seq = keyToEscapeSequence(e)
  if (seq) {
    invoke('pty_write', { data: seq }) // or ssh_pty_write for SSH mode
  }
}
```

### Escape sequence mapping

Required mappings for a functional shell (autocomplete, history, Ctrl+C, arrow keys):

```typescript
function keyToEscapeSequence(e: React.KeyboardEvent): string | null {
  // Control sequences
  if (e.ctrlKey) {
    const code = e.key.toLowerCase().charCodeAt(0) - 96
    if (code > 0 && code < 32) return String.fromCharCode(code)
  }

  const map: Record<string, string> = {
    Enter: '\r',
    Backspace: '\x7f',
    Tab: '\t',
    Escape: '\x1b',
    ArrowUp: '\x1b[A',
    ArrowDown: '\x1b[B',
    ArrowRight: '\x1b[C',
    ArrowLeft: '\x1b[D',
    Home: '\x1b[H',
    End: '\x1b[F',
    Delete: '\x1b[3~',
    PageUp: '\x1b[5~',
    PageDown: '\x1b[6~',
    F1: '\x1bOP', F2: '\x1bOQ', F3: '\x1bOR', F4: '\x1bOS',
    F5: '\x1b[15~', F6: '\x1b[17~', F7: '\x1b[18~', F8: '\x1b[19~',
    F9: '\x1b[20~', F10: '\x1b[21~', F11: '\x1b[23~', F12: '\x1b[24~',
  }

  return map[e.key] ?? (e.key.length === 1 ? e.key : null)
}
```

### Output rendering

```typescript
// In use-terminal-store.ts
const MAX_CHUNKS = 2000

// Add incoming chunk
set((state) => {
  const chunks = [...state.outputChunks, chunk]
  return { outputChunks: chunks.slice(-MAX_CHUNKS) }
})
```

Output is rendered as HTML from the ANSI-to-HTML converter — not as raw text. Use `dangerouslySetInnerHTML` on a `<pre>` inside the terminal container.

### ANSI-to-HTML converter

Minimal converter — only the SGR codes this project needs:

```typescript
const SGR_MAP: Record<number, string> = {
  0:  'color: #D4D0C4',           // reset → default text
  1:  'font-weight: bold',
  33: 'color: #D4AF37',           // gold — prompt, commands
  32: 'color: #3D9E68',           // success green
  31: 'color: #C4394D',           // error red
  34: 'color: #2874A6',           // info blue
  90: 'color: #555555',           // muted (dark gray)
}
```

Do not use a third-party ANSI library — the custom converter maps SGR 33 to `#D4AF37` (gold) specifically for the design system.

### Resize handling

```typescript
useEffect(() => {
  const observer = new ResizeObserver(() => {
    const { cols, rows } = measureTerminalDimensions(containerRef.current)
    invoke('pty_resize', { cols, rows })
  })
  observer.observe(containerRef.current)
  return () => observer.disconnect()
}, [])

function measureTerminalDimensions(el: HTMLElement): { cols: number; rows: number } {
  // Use a hidden char to measure monospace character dimensions
  const charWidth = el.querySelector('.char-measure')?.getBoundingClientRect().width ?? 8
  const charHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
  return {
    cols: Math.floor(el.clientWidth / charWidth),
    rows: Math.floor(el.clientHeight / charHeight),
  }
}
```

### StrictMode guard

```typescript
// Module-level — prevents double-registration in React StrictMode
let _terminalListening = false

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  init: async () => {
    if (_terminalListening) return
    _terminalListening = true

    await listen<string>('pty:data', (event) => {
      get().appendChunk(event.payload)
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

### Channel separation — critical rule

```
Interactive terminal  →  PTY + shell channel  (open once per SSH session)
Discrete commands     →  exec channel         (open new one per command, never reuse)
Script execution      →  exec channel         (with streaming output callback)
```

Mixing these causes echo duplication and non-deterministic exit on interactive channels.

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

**PTY dimensions on first render:** Call `pty_resize` after the terminal container has been painted (in a `useEffect` with the container ref dependency), not during initial mount.