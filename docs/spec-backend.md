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

| Command | Input | Output |
|---|---|---|
| `script_list` | `instance_id?` | `Vec<ScriptSummary>` |
| `script_get` | `id: String` | `Script` |
| `script_create` | `CreateScriptDto` | `Script` |
| `script_update` | `UpdateScriptDto` | `Script` |
| `script_delete` | `id: String` | — |
| `script_run` | `ScriptRunDto` | `exec_id: String` |
| `script_cancel` | `exec_id: String` | — |

### Sync History

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
| `script:output-line` | `{ execId, line, stream }` | Streaming execution |
| `script:completed` | `{ execId, exitCode, durationMs }` | Script finished |
| `script:error` | `{ execId, message }` | Script error |
| `pty:data` | `{ data: String }` | PTY output chunk |

---

## SQLite Schema

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

### Session Pool

```
SshPool: HashMap<InstanceId, SshSession>
```

- Max one active session per instance
- Auto-close after 5 minutes of inactivity
- Reconnect on drop: exponential backoff (1s → 2s → 4s → max 30s)

### Channel Architecture

- **PTY + shell channel** — interactive sessions (welcome banner, shell prompt)
- **Exec channel** — every discrete command; open new channel per command, never reuse

This separation prevents echo duplication and indeterminate exit on interactive channels.

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
| Script output | Stored in SQLite; never written to system logs |