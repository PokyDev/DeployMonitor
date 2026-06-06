# spec-rust-patterns.md

Rust coding rules and patterns for DeployMonitor. Apply these on every Rust file.

---

## Non-Negotiables

```rust
// NEVER in production code
value.unwrap()
value.expect("message")
panic!("...")

// ALWAYS for fallible operations
value?
return Err(AppError::SomethingFailed("...".to_string()))
```

- `unwrap()` and `expect()` are only acceptable in tests (`#[cfg(test)]`).
- Commands return `Result<T, String>` — the string is `AppError` serialized as `{ code, message }`.
- Use `?` operator for error propagation; avoid nested match chains.

---

## Ownership and Borrowing

```rust
// Prefer borrows in function signatures
fn process(name: &str, items: &[Item]) -> Result<Output, AppError>

// Not this (unless ownership transfer is required)
fn process(name: String, items: Vec<Item>) -> Result<Output, AppError>
```

- `&str` over `String`, `&[T]` over `Vec<T>` in parameters
- `Copy` types ≤ 24 bytes: pass by value
- Clone only when ownership transfer is genuinely required; never clone in hot paths
- Use `Cow<'_, str>` when a function sometimes needs owned data and sometimes doesn't

---

## Error Types

`AppError` is the single domain error type (see `spec-backend.md`). Use it everywhere.

```rust
// services and repositories
use thiserror::Error;

// commands layer (top level, call sites)
use anyhow::Context; // only for context enrichment, not as the return type
```

- New error variants go in `errors.rs`, not ad-hoc `String` errors
- Every `#[from]` impl in `AppError` covers a transparent conversion (sqlx, io, etc.)
- HTTP-like error codes in the `code` field make frontend error handling predictable

---

## Async Patterns

All Tauri commands are `async`. Services that call SSH or DB are `async`.

```rust
#[tauri::command]
async fn ssh_connect(
    instance_id: String,
    state: State<'_, AppState>,
) -> Result<ConnectionStatus, String> {
    state.ssh_service
        .connect(&instance_id)
        .await
        .map_err(|e| e.to_frontend_error())
}
```

- Never `.await` inside a `Mutex` lock — acquire lock, clone/extract needed data, drop lock, then `.await`
- Use `tokio::spawn` for background tasks (monitor polling); store `JoinHandle` in `MonitorTaskRegistry`
- Background tasks loop with `tokio::time::sleep` — not `std::thread::sleep`

---

## Concurrency

```rust
// AppState fields follow this pattern
pub ssh_pool: Arc<Mutex<SshPool>>,
```

- `Arc<Mutex<T>>` for shared mutable state across async tasks
- Keep critical sections short — never `.await` inside a locked section
- `SqlitePool` from `sqlx` is inherently `Send + Sync`; no wrapping needed

---

## Module Rules

`commands/` → only orchestration:

```rust
// CORRECT — thin command
#[tauri::command]
async fn script_run(dto: ScriptRunDto, state: State<'_, AppState>) -> Result<String, String> {
    state.script_service.run(dto).await.map_err(|e| e.to_frontend_error())
}

// WRONG — business logic in command
#[tauri::command]
async fn script_run(dto: ScriptRunDto, state: State<'_, AppState>) -> Result<String, String> {
    let session = state.ssh_pool.lock().unwrap().get(&dto.instance_id)?;
    // ... 50 lines of SSH logic ...
}
```

`ssh/` module has zero Tauri imports. It is a pure Rust library.

---

## SSH Channel Rules

```
Interactive terminal → PTY + shell channel (one per session)
Discrete commands    → exec channel (one per command, never reused)
Script execution     → exec channel with streaming output callback
```

Mixing these causes echo duplication and non-deterministic exit behavior.

---

## PTY Buffer Drain

```rust
// CORRECT — drain once after loop
while let Some(chunk) = pty_reader.read() {
    buffer.push(chunk);
}
drain_and_emit(&buffer); // called once here

// WRONG — partial overlap
while let Some(chunk) = pty_reader.read() {
    buffer.push(chunk);
    drain_and_emit(&buffer); // ← emits every chunk, causes overlapping output
}
```

---

## Linting

Run before every commit:

```bash
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo fmt
```

Key lints to watch in this project:
- `redundant_clone` — SSH session handling can introduce these
- `large_enum_variant` — `AppError` variants with heap data; box if needed
- `needless_collect` — monitoring data pipelines are prone to this

When suppressing a lint, use `#[expect(...)]` (not `#[allow(...)]`) with a comment explaining why:

```rust
#[expect(clippy::too_many_arguments, reason = "Tauri command signatures are generated")]
```

---

## Documentation

```rust
// Internal implementation detail (why, not what)
// We spawn here instead of awaiting to avoid blocking the Tauri command thread
// while waiting for the SSH handshake to complete.

/// Public API doc (what and how, used by rustdoc)
/// Establishes an SSH session for the given instance.
/// Returns `SshAuthFailed` if the `.pem` key is rejected.
pub async fn connect(config: &SshConfig) -> Result<SshSession, AppError>
```

- `//` for internal reasoning, workarounds, safety notes
- `///` for public-facing functions and structs
- Every `TODO` needs a linked issue: `// TODO(#42): implement reconnect backoff`

---

## Testing

```rust
// Test naming: behavior_should_outcome_when_condition
#[tokio::test]
async fn connect_should_return_auth_failed_when_pem_is_invalid() {
    // ...
}
```

- One assertion per test where possible
- Use `#[cfg(test)]` modules co-located with the code under test
- Integration tests for SSH live in `src-tauri/tests/` and require a local SSH server (document this)

---

## Type State for SSH Sessions

Encode session validity in the type system where practical:

```rust
pub struct SshSession<S = Connected> {
    inner: russh::client::Handle<Handler>,
    _state: PhantomData<S>,
}

pub struct Connected;
pub struct Authenticated;

impl SshSession<Connected> {
    pub async fn authenticate(self, config: &SshConfig) -> Result<SshSession<Authenticated>, AppError>
}

impl SshSession<Authenticated> {
    pub async fn exec(&self, cmd: &str) -> Result<CommandOutput, AppError>
}
```

This prevents calling `exec` on an unauthenticated session at compile time.