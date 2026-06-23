# spec-backend.md

Backend design for DeployMonitor. All backend logic runs in **Rust within the Tauri V2 native process**. No external server.

---

## Module Structure

```
src-tauri/src/
├── main.rs               # Tauri entry point, state registration, command registration
├── lib.rs                # Module re-exports
├── errors.rs             # AppError — single domain error type
├── commands/             # Tauri command handlers (thin controllers)
│   ├── mod.rs
│   ├── instances.rs
│   ├── ssh.rs
│   ├── scripts.rs
│   ├── monitoring.rs
│   └── pty.rs
├── services/             # Business logic — no Tauri imports
│   ├── mod.rs
│   ├── instance-service.rs
│   ├── ssh-service.rs
│   ├── script-service.rs
│   └── monitor-service.rs
├── repositories/         # SQLite access — sqlx queries
│   ├── mod.rs
│   ├── instance-repo.rs
│   ├── script-repo.rs
│   ├── sync-history-repo.rs
│   └── metric-snapshot-repo.rs
├── models/               # Domain structs (Serialize/Deserialize)
│   ├── mod.rs
│   ├── instance.rs
│   ├── script.rs
│   ├── sync-history.rs
│   └── metric.rs
├── ssh/                  # SSH module — zero Tauri dependencies
│   ├── mod.rs
│   ├── client.rs         # russh session abstraction
│   ├── pool.rs           # Per-instance session pool
│   ├── executor.rs       # Command + script execution
│   └── sftp.rs           # File upload/download
└── db/
    ├── mod.rs
    └── migrations/
        ├── 0001-initial-schema.sql
        ├── 0002-sync-history.sql
        └── 0003-metric-snapshots.sql
```

> ⚠ **Status: aspirational.** The tree above is a target shape — `commands/instances.rs`, the entire `repositories/`, `models/`, `ssh/`, and `db/` trees, and a DB-backed `script-service.rs`/`script-repo.rs` do not exist yet. The real current tree is flat:
> ```
> src-tauri/src/
> ├── main.rs / lib.rs / error.rs / state.rs
> ├── commands/{monitoring,pty,scripts,ssh}.rs
> └── services/{monitor_service,pty_service,script_fs_service,ssh_connect}.rs
> ```
> `AppState` (`state.rs`) only holds `pty` and `monitor` — no `db`, no `ssh_pool`. Scripts are local files on disk (`script_fs_service.rs`), not a DB table. The new script-remote-execution service (see "Script Remote Execution" below) is `services/script_remote_service.rs`, a sibling of `ssh_connect.rs` — not a new module under the nonexistent `ssh/` tree.

### Layer Dependencies (enforced)

```
commands → services → repositories → db
              ↓
            ssh/
```

`ssh/` is a leaf module — no imports from other internal modules.

---

## Global App State

```rust
pub struct AppState {
    pub db: Arc<SqlitePool>,
    pub ssh_pool: Arc<Mutex<SshPool>>,
    pub monitor_tasks: Arc<Mutex<MonitorTaskRegistry>>,
}
```

Registered in `main.rs` via `.manage(AppState { ... })`. Injected into commands via `State<'_, AppState>`.

---

## Error Handling

All domain errors flow through `AppError`. Serialized as `{ code, message }` for the frontend.

```rust
// errors.rs
#[derive(thiserror::Error, Debug)]
pub enum AppError {
    #[error("Instance not found: {0}")]
    InstanceNotFound(String),

    #[error("SSH connection failed: {0}")]
    SshConnectionFailed(String),

    #[error("SSH authentication failed")]
    SshAuthFailed,

    #[error("Script execution failed (exit {exit_code}): {message}")]
    ScriptFailed { exit_code: i32, message: String },

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),
}
```

Commands return `Result<T, String>` — the `String` is the serialized error object consumed by the TypeScript frontend.

---

## Tauri Commands Catalog

Convention: `snake_case`, domain prefix, always `async`. Commands are thin — validate, delegate, map errors.

### Instances

| Command | Input | Output |
|---|---|---|
| `instance_list` | — | `Vec<InstanceSummary>` |
| `instance_get` | `id: String` | `Instance` |
| `instance_create` | `CreateInstanceDto` | `Instance` |
| `instance_update` | `UpdateInstanceDto` | `Instance` |
| `instance_delete` | `id: String` | — |

### SSH Connection

| Command | Input | Output |
|---|---|---|
| `ssh_connect` | `instance_id: String` | `ConnectionStatus` |
| `ssh_disconnect` | `instance_id: String` | — |
| `ssh_test_connection` | `TestConnectionDto` | `TestResult` |
| `ssh_run_command` | `instance_id, command` | `CommandOutput` |

### PTY Terminal

| Command | Input | Output |
|---|---|---|
| `pty_start` | `{ cols, rows }` | — |
| `pty_write` | `{ data: String }` | — |
| `pty_resize` | `{ cols, rows }` | — |
| `pty_stop` | — | — |

### Scripts

Local file management (real, implemented — `commands/scripts.rs` → `services/script_fs_service.rs`):

| Command | Input | Output |
|---|---|---|
| `script_fs_list` | `dir_path: String` | `Vec<ScriptFileEntry>` |
| `script_fs_read` | `path: String` | `String` |
| `script_fs_write` | `path: String, content: String` | — |
| `script_fs_create` | `dir_path: String, file_name: String` | `ScriptFileEntry` |
| `script_fs_delete` | `path: String` | — |
| `script_fs_rename` | `path: String, new_name: String` | `ScriptFileEntry` |

`script_fs_delete` only removes the local file. The frontend (`use-script-remote.ts`'s `cleanupRemoteCopy`) separately fires a best-effort `script_remote_delete` alongside it when connected — there is no combined "delete both" command, and local deletion never blocks on the remote side.

Remote execution (new — see "Script Remote Execution" under § SSH Module):

| Command | Input | Output |
|---|---|---|
| `script_remote_prepare` | `pem_path, user, host, port, content, file_name` (flat params, not a wrapped Dto — matches the convention every other real command in this file already uses) | `ScriptRemotePrepareResult { remote_path: String, uploaded: bool }` |
| `script_remote_delete` | `pem_path, user, host, port, file_name` | `bool` — whether a remote file actually existed and was removed; `false` is not an error |
| `script_remote_rename` | `pem_path, user, host, port, old_file_name, new_file_name` | `bool` — whether a remote file actually existed and was renamed; `false` is not an error |

`script_fs_rename(path, new_name) -> ScriptFileEntry` (local-only, `script_fs_service.rs`) pairs with `script_remote_rename` — the frontend calls the local rename first and only fires the remote one if it succeeds. See "Script Remote Execution" below for why renaming no longer needs any state to decide whether a remote copy exists.

There is no `script_run` command — running a script is just `pty_write(...)` against the already-open interactive terminal with the resolved `remote_path`, exactly like typing any other shell command. There is no `script_cancel` command — cancelling is the user pressing Ctrl+C in the terminal, same as cancelling anything else they typed there. The old DB-backed `script_list`/`script_get`/`script_create`/`script_update`/`script_delete`/`script_run`/`script_cancel` commands and the `ScriptSummary`/`Script`/`ScriptRunDto` types they imply are **superseded** — they were never implemented and the feature direction changed; do not implement them.

### Sync History

> ⚠ **Status: aspirational, not implemented.** Depends on the `sync_history` table, which is not implemented either (see § SQLite Schema status note) — script-run history is not persisted anywhere today.

| Command | Input | Output |
|---|---|---|
| `sync_history_list` | `instance_id, page, limit` | `PaginatedHistory` |
| `sync_history_get` | `id: String` | `SyncHistoryEntry` |

### Monitoring

| Command | Input | Output |
|---|---|---|
| `monitor_start` | `instance_id: String` | — |
| `monitor_stop` | `instance_id: String` | — |
| `monitor_get_latest` | `instance_id: String` | `MetricSnapshot` |
| `monitor_get_history` | `instance_id, from, to` | `Vec<MetricSnapshot>` |

---

## Tauri Events (Backend → Frontend)

| Event | Payload | When |
|---|---|---|
| `instance:status-changed` | `{ instanceId, status }` | SSH state transitions |
| `monitor:metrics-update` | `{ instanceId, snapshot }` | Every poll cycle |
| `pty:data` | `{ data: String }` | PTY output chunk — also carries script output and its OSC completion marker, see "Script Remote Execution" |
| `script:upload-progress` | `{ file_name, percent, bytes_uploaded, total_bytes }` | Emitted per chunk while `script_remote_prepare` is writing the file over its own SFTP side-channel — never on the interactive PTY |

`script:output-line`, `script:completed`, and `script:error` are **superseded** — they implied a dedicated streaming channel for script execution that the current design doesn't have. Script output is just more `pty:data`; completion is detected frontend-side by matching the OSC end-marker in that same stream (mirrors how SSH connect/disconnect is already detected in `use-terminal-store.ts`).

---

## SQLite Schema

> ⚠ **Status: aspirational, not implemented.** `sqlx` is a declared dependency (`Cargo.toml`) but nothing in `src-tauri/src/` opens a database, runs a migration, or has a `db` field on `AppState` — there is no SQLite layer today. The connection form lives in `tauri-plugin-store` (`connection-settings.json`) on the frontend; scripts are local files (`script_fs_service.rs`); script-run history is **not persisted anywhere** — output only ever exists in the terminal's xterm scrollback while the session is open. The schema below stays as a possible future direction. In particular, `scripts` (content/description/script_type columns) and all of `sync_history` describe a DB-backed script entity and run-log that the current design (see "Script Remote Execution") does not use — scripts on the remote instance are identified by content hash, not a DB row, and runs are not logged.

### `0001-initial-schema.sql`

```sql
CREATE TABLE instances (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    host        TEXT NOT NULL,
    port        INTEGER NOT NULL DEFAULT 22,
    username    TEXT NOT NULL,
    pem_path    TEXT NOT NULL,
    tags        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE scripts (
    id          TEXT PRIMARY KEY,
    instance_id TEXT REFERENCES instances(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    description TEXT,
    content     TEXT NOT NULL,
    script_type TEXT NOT NULL DEFAULT 'sync',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
```

### `0002-sync-history.sql`

```sql
CREATE TABLE sync_history (
    id            TEXT PRIMARY KEY,
    instance_id   TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    script_id     TEXT REFERENCES scripts(id) ON DELETE SET NULL,
    script_name   TEXT NOT NULL,
    triggered_by  TEXT NOT NULL DEFAULT 'manual',
    status        TEXT NOT NULL,
    stdout        TEXT,
    stderr        TEXT,
    exit_code     INTEGER,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    duration_ms   INTEGER
);
CREATE INDEX idx-sync-history-instance ON sync_history(instance_id);
CREATE INDEX idx-sync-history-status ON sync_history(status);
```

### `0003-metric-snapshots.sql`

```sql
CREATE TABLE metric_snapshots (
    id            TEXT PRIMARY KEY,
    instance_id   TEXT NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    cpu_pct       REAL,
    mem_used_mb   REAL,
    mem_total_mb  REAL,
    disk_used_gb  REAL,
    disk_total_gb REAL,
    load_avg_1    REAL,
    sampled_at    TEXT NOT NULL
);
CREATE INDEX idx-metric-instance ON metric_snapshots(instance_id);
CREATE INDEX idx-metric-time ON metric_snapshots(sampled_at);
```

**Retention policy:** `metric_snapshots` older than 7 days are purged at app startup and every 24h via a `tokio::spawn` background task.

---

## SSH Module

> ⚠ **Status: aspirational.** There is no `SshPool` and no `ssh_pool` field on `AppState`. `monitor_service.rs` is the one real consumer of `russh` today, and it keeps its own single `client::Handle` alive for the lifetime of its polling task (reconnecting with backoff on drop) — it does not share a pool with anything else. Any new code that needs a `russh` session, including the script-upload side-channel below, should open its own short-lived `connect_authenticated(...)` handle and disconnect when done, the same way `ssh_test_connection` already does — do not build a shared pool to support this.

### Session Pool

```
SshPool: HashMap<InstanceId, SshSession>
```

- Max one active session per instance
- Auto-close after 5 minutes of inactivity
- Reconnect on drop: exponential backoff (1s → 2s → 4s → max 30s)

(Kept as a documented future direction — not implemented; see status note above.)

### Channel Architecture

- **Interactive terminal** — local PTY (`portable-pty`) running the system `ssh` binary as a subprocess. Not a `russh` channel today — see `spec-terminal.md` § "Backend: SSH Terminal" status note.
- **Exec channel** (`russh`) — every discrete, non-interactive command opens its own short-lived authenticated session + `channel_open_session().exec()`, never reused. `monitor_service.rs` is the reference implementation; the script existence-check/upload side-channel below follows the same pattern.

Never run a discrete command by typing it into the interactive PTY unless the user is meant to see it happen live (e.g. running an already-uploaded script). That channel echoes back anything written to it exactly as if typed, which is why payload injection (base64 script content, etc.) doesn't belong there — see `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel".

### Script Remote Execution (side-channel upload + existence check)

> **Status: Part 1 and Part 2 implemented (2026-06-22 upload/verify, file-name keying + rename sync 2026-06-23, run-on-terminal 2026-06-23)** — the upload/verify/rename side-channel is real (`script_remote_service.rs`), and so is sending the resolved `remote_path` to the interactive terminal: `useScriptRemote.executeScript` (`src/hooks/use-script-remote.ts`) calls `runRemoteScript(remote_path)` (`src/stores/use-terminal-store.ts`) right after a successful `script_remote_prepare`. The frontend gates the whole flow on `connection.isOnline` (the same SSH-state the terminal/dashboard already track) *before* even calling the command — if there's no active session, it shows an inline message and never reaches Rust. No Rust changes were needed for Part 2 — `pty_write` already covered it; this was entirely frontend orchestration. See `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel" for the run/detection design.

New service: `services/script_remote_service.rs` (sibling of `ssh_connect.rs`, not under a `ssh/` module — see Module Structure note above).

**Why file-name keying, not content-hash.** The remote file is named exactly like the local one (`.deploy-monitor/scripts/<file_name>`), not `<sha256(content)><extension>` as an earlier version of this design used. Content-hash naming made "already uploaded" a stateless remote *existence* check, but every edit produced a brand-new remote filename with no link back to the one it superseded — orphans piled up unless something tracked "what was the previous hash for this path" and cleaned it up afterward. That tracking ended up needing a frontend-only manifest (`LazyStore('script-remote-state.json')`) anyway, which reintroduced exactly the statefulness the hash naming was meant to avoid, just relocated to the frontend and prone to silently leaving orphans behind when its fire-and-forget cleanup delete failed. File-name keying sidesteps the whole problem: the local scripts directory is flat and already enforces unique file names (`script_fs_service::create_file` / `rename_file`, both using `create_new(true)` / a pre-rename existence check), so naming the remote file after the local one gives a stable 1:1 identity for free — re-running after an edit overwrites the same remote path instead of minting a new one. There is no manifest anywhere in this flow anymore.

**Flow**, triggered when the user clicks "Ejecutar" on a script open in the Scripts editor:

1. Frontend checks `connection.isOnline` — if false, shows "Debes conectarte a la instancia por SSH antes de ejecutar un script." and stops; no Tauri call is made.
2. If the file is dirty, frontend auto-saves it first (`save()`).
3. Frontend calls `script_remote_prepare(pem_path, user, host, port, content, file_name)` — `file_name` is the local file's own name including its extension (e.g. `deploy.sh`), used verbatim as the remote filename.
4. Rust opens one short-lived `connect_authenticated(...)` session (same helper `ssh_test_connection` uses), then a **single SFTP subsystem channel** on it (`channel.request_subsystem(true, "sftp")` + `russh_sftp::client::SftpSession::new(channel.into_stream())`) — existence-check, upload, and verification all happen over that one channel:
   a. `mkdir` (idempotent — ignore errors) for `.deploy-monitor` and `.deploy-monitor/scripts`, **relative** to the SFTP session's default cwd. Never a literal `~/...` — the SFTP protocol does not shell-expand `~`.
   b. `sftp.metadata(remote_path)`: if it already exists and its size matches `content.len()`, skip the upload (`uploaded = false`) — a byte-length check, not a content comparison; same approximation as before, unaffected by the naming change.
   c. Otherwise, write the content in ~32 KiB chunks, emitting `script:upload-progress` after each chunk, then re-`metadata()` the path and compare size again — this is the "verify it actually landed correctly" step. Mismatch → `RemoteCheckFailed`.
   d. Sets the file executable (`0o755`) via `sftp.set_metadata(...)`.
   e. Disconnects.
5. Returns `{ remote_path: ".deploy-monitor/scripts/<file_name>", uploaded: bool }` to the frontend.
6. Frontend maximizes the terminal panel if it's minimized (`useDashboardStore.setTerminalExpanded(true)`), unlocks it if the welcome lock screen is still showing, then sends **one line** to the already-open interactive terminal: `runRemoteScript(remote_path)` calls `termStore.write('bash <remote_path>; printf \'\\033]633;DM-DONE;%s\\007\' "$?"\r')`. It resolves with the exit code once the OSC 633 marker is parsed back out of `pty:data` (see `spec-terminal.md`), or rejects if the SSH session drops before that happens — there is no other timeout, since a script may legitimately run for a long time. A re-click on "Ejecutar" while a run (upload or execution) is already in flight is ignored, since the interactive PTY has no notion of queuing — see `use-script-remote.ts`'s `ScriptActionStatus` (`uploading` → `running` → `success`/`error`).

**Local rename stays in sync.** Double-clicking a script's name in the Scripts list (`scripts.tsx`'s `ScriptListItem`) renames it in place via `script_fs_rename(path, new_name)`. On success, the frontend fires `script_remote_rename(pem_path, user, host, port, old_file_name, new_file_name)` — fire-and-forget, same pattern as delete cleanup below. Both `script_remote_delete` and `script_remote_rename` treat "the old file was never uploaded" as `Ok(false)`, not an error, so the frontend never needs to track or ask whether a remote copy exists before calling them. `rename_remote` clears anything already sitting at the destination name first, since SFTP `rename` fails if the destination exists (e.g. a leftover from a since-deleted script that once had that name).

`script_remote_delete(pem_path, user, host, port, file_name) -> bool` and `script_remote_rename(pem_path, user, host, port, old_file_name, new_file_name) -> bool` share `open_sftp_session`/`close_sftp_session` with `prepare`.

**`AppError` variants** (`error.rs`):
- `ScriptUploadFailed(String)` → `SCRIPT_UPLOAD_FAILED`
- `RemoteCheckFailed(String)` → `REMOTE_CHECK_FAILED`
- `RemoteDeleteFailed(String)` → `REMOTE_DELETE_FAILED`
- `RemoteRenameFailed(String)` → `REMOTE_RENAME_FAILED`

Connection-level failures reuse the existing `SshHostUnreachable` / `SshTimeout` / `SshAuthFailed` / `SshConnectionFailed` variants — `connect_authenticated` already returns those.

### Metrics Collection (no remote agent)

```bash
cat /proc/loadavg && \
free -m | awk '/Mem:/{print $2,$3}' && \
df -BG / | awk 'NR==2{print $2,$3}'
```

Parsed in `monitor-service.rs`. All metrics obtained via SSH exec — nothing installed on the remote server.

### PTY Implementation

- Crate: `portable-pty = "0.8"`
- Shell detection priority: `pwsh.exe` → `powershell.exe` → `cmd.exe` (Windows); `$SHELL` → `/bin/bash` (Unix)
- Golden prompt (`#D4AF37`) auto-injected at startup via ANSI escape
- `drain_pty_buffer` called **once after the read loop** — not inside it
- This backend layer is unchanged by the frontend's move to `xterm.js` (see `spec-terminal.md`). It still emits raw byte chunks on `pty:data` / `ssh:pty-data` — the frontend is now the only thing that changed how it consumes them.

---

## App Startup Sequence

```
1. Open/create SQLite at Tauri app_data_dir()
2. Run pending sqlx migrations
3. Initialize empty SshPool
4. Initialize empty MonitorTaskRegistry
5. Purge metric_snapshots older than 7 days (background task)
6. Restore monitoring for instances flagged as active in previous session
7. Register all Tauri commands
8. Open main window
```

---

## Security Model

| Area | Measure |
|---|---|
| `.pem` files | Path stored in SQLite; file read in Rust process only — never exposed to renderer |
| Passwords | Argon2id hash before storage; never logged |
| SSH auth | Public key only — no password auth |
| IPC | Only explicitly registered commands are callable from renderer |
| Renderer capabilities | Declared per-command in `capabilities/` — minimal surface |
| Script output | Lives only in the terminal's xterm scrollback for the session — never persisted to disk or logs |