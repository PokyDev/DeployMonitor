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
│   ├── script_log.rs     # script_log_* — run-history JSON files
│   ├── monitoring.rs
│   └── pty.rs
├── services/             # Business logic — no Tauri imports
│   ├── mod.rs
│   ├── instance-service.rs
│   ├── ssh-service.rs
│   ├── script-service.rs
│   ├── script_log_service.rs   # reads/writes run-history JSON files on disk
│   └── monitor-service.rs      # also appends JSONL snapshot lines
├── models/               # Domain structs (Serialize/Deserialize) — plain structs, no DB
│   ├── mod.rs
│   ├── instance.rs
│   ├── script.rs
│   ├── script_log.rs     # ScriptLogEntry / ScriptLogSummary
│   └── metric.rs
└── ssh/                  # SSH module — zero Tauri dependencies
    ├── mod.rs
    ├── client.rs         # russh session abstraction
    ├── pool.rs           # Per-instance session pool
    ├── executor.rs       # Command + script execution
    └── sftp.rs           # File upload/download
```

> ⚠ **Status: aspirational.** The tree above is a target shape — `commands/instances.rs`, `commands/script_log.rs`, the entire `models/` and `ssh/` trees, and a `script-service.rs` do not exist yet. `script_log_service.rs` is real (read-only so far — see "Script Run History" below). The real current tree is flat:
> ```
> src-tauri/src/
> ├── main.rs / lib.rs / error.rs / state.rs
> ├── commands/{monitoring,pty,scripts,ssh}.rs
> └── services/{monitor_service,pty_service,script_fs_service,script_log_service,script_remote_service,ssh_connect}.rs
> ```
> `AppState` (`state.rs`) only holds `pty` and `monitor` — no `db`, no `ssh_pool`. There is no `db` module and never has been — see "Script Run History" and "Monitoring Snapshots" below for why this app has no embedded database at all. Scripts are local files on disk (`script_fs_service.rs`), not a DB table. The script-remote-execution service (see "Script Remote Execution" below) is `services/script_remote_service.rs`, a sibling of `ssh_connect.rs` — not a new module under the nonexistent `ssh/` tree. `commands/instances.rs`, `instance-service.rs`, and `models/instance.rs` describe a still-undecided multi-instance future (today's MVP is single-instance per `spec-navigation.md`) — they're kept in this tree as a placeholder only; what they'd persist to is out of scope for this doc's disk-vs-DB decision and needs its own follow-up.

### Layer Dependencies (enforced)

```
commands → services → ssh/
```

`ssh/` is a leaf module — no imports from other internal modules. Services that persist data (`script_log_service.rs`, `monitor_service.rs`) read/write plain files directly via `tokio::fs` + `serde_json` — there is no repository/DB layer to go through.

---

## Global App State

```rust
pub struct AppState {
    pub ssh_pool: Arc<Mutex<SshPool>>,
    pub monitor_tasks: Arc<Mutex<MonitorTaskRegistry>>,
}
```

No `db` field — there is no database. `script_log_service.rs` and `monitor_service.rs` resolve their own on-disk paths per call (scripts root for logs, `app_data_dir()` for monitoring) instead of holding a shared handle in state.

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

    #[error("Failed to write run-history log: {0}")]
    ScriptLogWriteFailed(String),

    #[error("Failed to read run-history log: {0}")]
    ScriptLogReadFailed(String),

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

### Script Run History

> ⚠ **Status: read and write sides both implemented (2026-06-25).** Replaces the old DB-backed "Sync History" design (`sync_history_list`/`sync_history_get` against a `sync_history` table) — superseded along with the rest of the SQLite layer, see § "Script Run History — Disk Format" further down this doc. `script_log_list`/`script_log_get`/`script_log_write` are all real (`services/script_log_service.rs`). `use-script-remote.ts`'s `executeScript` calls `script_log_write` (fire-and-forget) once `runRemoteScript` resolves with an actual exit code — a run lost to a dropped SSH session (`SSH_CONNECTION_LOST`) is not logged, since it has no clean `exit_code`/`duration` and already has its own error message in the UI.
>
> **2026-06-24 update:** the logs/outputs directory is now an independently user-configured setting (`logsDirectoryPath`, persisted in its own `history-settings.json` via `use-script-history.ts`), no longer derived from the Scripts editor's `dir_path` — see § "Script Run History — Disk Format" below for the migration story. `script_log_write` writes into this same configured path (creating it via `create_dir_all` if it doesn't exist yet), not `<scripts_dir>/outputs/`.
>
> **2026-06-25 update:** `script_log_write` takes flat params (`outputs_dir, script_name, started_at, duration_ms, exit_code, output`), not a wrapped DTO — matches the convention every other command in `commands/scripts.rs` already uses (e.g. `script_remote_prepare`). `status`/`triggered_by` are deliberately not accepted as input: `status` is derived from `exit_code` in `write_log` (single source of truth, never trusted from the caller), and `triggered_by` is resolved from `USERNAME`/`USER`. `output` is the **raw** `pty:data` text `runRemoteScript` (`use-terminal-store.ts`) accumulates between sending the run command and the OSC `DM-DONE` marker — not xterm's rendered buffer text — specifically so real ANSI/SGR codes the script printed survive into the stored log. The Historial detail view (`history.tsx`) renders that raw text back through its own read-only xterm.js instance (`history-log-terminal.tsx`), replacing the old heuristic `classifyLine` line-by-line classifier, which could never have interpreted real ANSI codes anyway.

| Command | Input | Output | Status |
|---|---|---|---|
| `script_log_write` | `outputs_dir, script_name, started_at, duration_ms: u64, exit_code: i32, output` (flat params) | `ScriptLogSummary` | Implemented |
| `script_log_list` | `outputs_dir: String` — the user-configured logs folder itself | `Vec<ScriptLogSummary>` — newest first, no `output` field | Implemented |
| `script_log_get` | `path: String` | `ScriptLogEntry` — full entry including `output` | Implemented |

`script_log_list` treats a missing folder as zero entries (`Ok(vec![])`), not an error — there being no run-history yet is a normal state, unlike the Scripts editor's `dir_path`, which the user actively picked and expects to exist. A single file that fails to parse is skipped (logged via `tracing::warn!`) rather than failing the whole list.

`script_log_write`'s input deliberately omits `triggered_by` and `status` — Rust fills in `triggered_by` from the local OS session (`USERNAME`/`USER` env var) and derives `status` from `exit_code` at write time, see § "Script Run History — Disk Format" below. The frontend (`use-script-remote.ts`) assembles everything it can only know from watching the terminal (which script, when it started, how long it took, the exit code resolved by `runRemoteScript`, and the raw output text it captured) and calls `script_log_write` once the run finishes; Rust adds the environment fact and the derived status, then persists. This mirrors `script_fs_*`: the renderer never touches the filesystem directly, only through a typed command.

### Monitoring

| Command | Input | Output |
|---|---|---|
| `monitor_start` | `instance_id: String` | — |
| `monitor_stop` | `instance_id: String` | — |
| `monitor_get_latest` | `instance_id: String` | `MetricSnapshot` |
| `monitor_get_history` | `instance_id, from, to` | `Vec<MetricSnapshot>` |

`monitor_get_latest` is served from the live in-memory last sample the polling loop already holds — no disk read. `monitor_get_history` reads the relevant day's JSONL file(s) under `app_data_dir()/monitoring/` and filters by `t >= from && t <= to` — replaces the old SQL range query, see § "Monitoring Snapshots" below. Backs the `monitor.tsx` range tabs (30min/1h/6h/24h), which today just show a "not implemented" toast.

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

## Script Run History — Disk Format

> ⚠ **Status: implemented (2026-06-25).** No SQLite, no `sync_history` table — see "SQLite removed, disk-based JSON adopted instead" in `spec-architecture.md` for why. One JSON file per script execution. `script_log_service.rs` lists, reads, and writes these files; `write_log` creates `outputs_dir` via `create_dir_all` if it doesn't exist yet (unlike the Scripts editor's directory, which the user actively picked through a native folder picker and can be assumed to exist).

**Location:** a folder the user picks explicitly from the Historial view (the locked path field + native picker in `history.tsx`'s toolbar on a maximized window, or inside `HistoryFilterDrawer` on a minimized one — mirrors the Scripts editor's own directory field, both now built on the shared `directory-path-field.tsx`). Persisted as `logsDirectoryPath` in its own `history-settings.json` store via `use-script-history.ts` — **independent of** the Scripts editor's `dir_path`/`scripts-settings.json` as of 2026-06-24; earlier this was implicitly `<scripts_dir>/outputs/` and not separately configurable. The Rust side just lists whatever path it's given (`list_logs(outputs_dir: &str)`, no `.join("outputs")` anymore) — it has no opinion on where that folder lives relative to the scripts root.

**Migration for existing users:** the first time `use-script-history.ts` finds no `logsDirectoryPath` saved, it reads the Scripts editor's `directoryPath` (read-only, one-time), defaults to `<that>/outputs`, and persists it as the new independent setting — so logs written under the old implicit convention (including the hand-seeded mock files) keep showing up without the user having to do anything, while remaining free to point Historial elsewhere afterward.

**File naming:** `<started_at>__<script_name>.json`, e.g. `2026-06-23T14-32-01Z__deploy.sh.json`. `started_at` uses RFC 3339 with `:` replaced by `-` (colons aren't valid in Windows filenames). Lexicographic filename sort is chronological sort — `script_log_list` just reverses a directory listing, no index file needed.

**Shape:**

```json
{
  "script_name": "deploy.sh",
  "triggered_by": "andres.socha",
  "status": "success",
  "started_at": "2026-06-23T14:32:01Z",
  "duration_ms": 4820,
  "exit_code": 0,
  "output": "[14:32:01] Iniciando ejecución remota…\n[14:32:09] ✓ Despliegue completado\n"
}
```

`status` is `"success"` if `exit_code == 0`, else `"error"` — matches the two states in the user's ask and the UI (`src/hooks/use-script-history.ts`'s `ExecutionStatus`, renamed from the old mock's `ExecutionResult`/`'failed'` to `'error'` to match, 2026-06-24); derived in `write_log` from `exit_code`, never sent by the frontend. `triggered_by` is the local OS username (`std::env::var("USERNAME").or_else(|_| std::env::var("USER"))`), filled in by `script_log_write` at write time, not sent by the frontend — it describes who has the desktop app open, not which SSH user the script ran as remotely. `output` is the **raw** text accumulated from `pty:data` between the run starting and the OSC `DM-DONE` marker (see `spec-terminal.md`), captured by `runRemoteScript` (`use-terminal-store.ts`) rather than read back from xterm's rendered buffer — this deliberately preserves any real ANSI/SGR codes the script printed, since the Historial detail view re-renders this text through its own read-only xterm.js instance (`history-log-terminal.tsx`). The only thing stripped before saving is the OSC marker sequence itself (`\x1b]633;DM-DONE;<code>\x07`), a pure signaling artifact, not log content. Stored inline rather than in a separate file since expected sizes (deploy/backup/health-check scripts) are a few KB, not megabytes — revisit only if that assumption stops holding.

No retention policy — unlike monitoring snapshots, run history has no natural expiry; it accumulates for as long as the user keeps the configured logs directory. Pagination/cleanup is a future concern, not a v1 requirement.

This directly supersedes the Security Model row "Script output | Lives only in the terminal's xterm scrollback... never persisted to disk or logs" (see § Security Model below) — output is now persisted by design.

---

## Monitoring Snapshots

> ⚠ **Status: proposed, not implemented (2026-06-23).** No SQLite, no `metric_snapshots` table. One append-only JSONL (newline-delimited JSON) file per day, written by `monitor_service.rs` itself — not frontend-assembled, since `sample()` already produces a complete `MetricSnapshot` in Rust on every poll tick with no frontend round-trip involved.

**Location:** `app_data_dir()/monitoring/<YYYY-MM-DD>.jsonl` (Tauri's app data dir, not the user's scripts folder — this data isn't tied to where scripts live). One file per calendar day, one line appended per poll tick (every `POLL_INTERVAL` = 2s).

**Line shape** (short keys — this is the highest-frequency data in the app, ~43k lines/day at the current poll interval):

```json
{"t":"2026-06-23T14:32:00Z","cpu":12.4,"mem_u":812,"mem_t":2048,"disk_u":18,"disk_t":40,"load1":0.42,"load5":0.31,"load15":0.22,"swap_u":0,"swap_t":0,"net_rx":0.012,"net_tx":0.004,"uptime":845221,"proc":134,"conn":18,"temp":52.1}
```

Append happens inline in the existing polling loop (`monitor_service.rs`'s `sample()` success branch, right where `monitor:metrics-update` is already emitted) — open in append mode, write the line, no batching needed at a 2s cadence.

**Retention policy:** day-files older than 7 days are deleted at app startup and every 24h via the same `tokio::spawn` background task already speced — a filename-date check (`YYYY-MM-DD.jsonl` older than `now - 7d`) instead of a SQL `DELETE WHERE`. At ~43k lines/day and roughly 120-150 bytes/line, a day-file is a few MB — trivial to read fully into memory when `monitor_get_history` needs to filter a window, and the 7-day cap keeps total size bounded to tens of MB regardless of how long the app has been running.

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
1. Initialize empty SshPool
2. Initialize empty MonitorTaskRegistry
3. Purge monitoring/*.jsonl day-files older than 7 days (background task, see § Monitoring Snapshots)
4. Restore monitoring for instances flagged as active in previous session
5. Register all Tauri commands
6. Open main window
```

No database to open and no migrations to run — there is no `db` layer (see § "Script Run History" / "Monitoring Snapshots" above).

---

## Security Model

| Area | Measure |
|---|---|
| `.pem` files | Path stored via `tauri-plugin-store` (`connection-settings.json`, frontend-managed but disk-backed through the Tauri runtime, not raw renderer FS access); file content read in Rust process only — never exposed to renderer |
| Passwords | Argon2id hash before storage; never logged |
| SSH auth | Public key only — no password auth |
| IPC | Only explicitly registered commands are callable from renderer |
| Renderer capabilities | Declared per-command in `capabilities/` — minimal surface |
| Script output | Persisted to a per-run JSON log under the user-configured logs directory (see § "Script Run History — Disk Format") in addition to the terminal's live xterm scrollback — written only by Rust via `script_log_write`, never directly by the renderer |