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
- The same `Terminal` component (in read-only mode) is the preferred renderer for streamed script-automation output (see "Reuse for script automation output" below) — do not build a second ANSI renderer for that feature.

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

### Reuse for script automation output

Script execution runs over **exec channels** (`spec-backend.md` § SSH exec channel), separate from the interactive PTY/SSH terminal above. That output is mostly linear/append-only but can still contain ANSI color codes (npm, pnpm, ansible, docker output). Reuse the same `Terminal` wrapper component in read-only mode (`disableStdin: true`, no `onData` handler, feed chunks via `term.write()`) to render it. This avoids maintaining a second ANSI renderer for script logs — one `xterm.js`-backed component serves both the interactive terminal and script output viewers.

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

**PTY dimensions on first render:** Call `pty_resize` after the terminal container has been painted (in a `useEffect` with the container ref dependency), not during initial mount. With xterm.js, call `fitAddon.fit()` first and derive `cols`/`rows` from `term` — `fit()` on a zero-size container (e.g. `display: none` parent) produces `1x1` and must be re-run once the container has real dimensions.

**xterm.js CSS import:** `@xterm/xterm/css/xterm.css` must be imported once (e.g. in the terminal panel component). Without it, the terminal renders unstyled/invisible.

**Terminal instance lifecycle:** Call `term.dispose()` on unmount. Each `Terminal` instance attaches DOM nodes and internal listeners to its container — skipping disposal leaks on every mount/unmount cycle (tab close, route change).