# CLAUDE.md — DeployMonitor / SSH Manager

Agent rules for Claude Code. Read this file on every session start. Specs are in `docs/`.

---

## Project Identity

Desktop app for SSH-based cloud instance management and automation.
**Stack:** Tauri V2 · React 19 · TypeScript · Vite 7 · Rust (backend core)

---

## Session Start Protocol

At the start of every session:
1. Search Engram for recent decisions: `mem_search "recent decisions"`
2. Read the spec relevant to today's task (see table below)
3. Confirm understanding before writing any code

At the end of every significant session:
- Save decisions to Engram: `mem_session_end` or explicit `mem_save`
- Include: what was done, why, which files were affected, what to watch for

---

## Mandatory Reading Order

| Task domain | Read first |
|---|---|
| UI / components / styles | `docs/spec-frontend.md` |
| Rust commands / services / disk persistence | `docs/spec-backend.md` |
| Terminal (PTY + SSH) | `docs/spec-terminal.md` |
| New screen or route | `docs/spec-navigation.md` |
| Architecture decisions | `docs/spec-architecture.md` |
| Any Rust code | `docs/spec-rust-patterns.md` |

---

## Non-Negotiable Rules

### General
- **Never break existing functionality.** If a change risks regression, flag it explicitly before proceeding.
- **No spaghetti code.** If a file grows beyond its single responsibility, refactor before adding more.
- **Refactor duplicate logic** before duplicating it. Extract shared utilities to `src/lib/` or Rust `services/`.
- **Propose before implementing.** For any non-trivial feature, explain the approach and wait for confirmation.
- **Be critical, not compliant.** If the requested approach has problems, say so with specific reasons before proceeding.

### File & Naming Conventions
- All files use **kebab-case**: `metric-card.tsx`, `use-ssh-connection.ts`, `ssh-service.rs`
- React components: `.tsx`
- Hooks: `use-*.ts` or `use-*.tsx`
- Zustand stores: `use-*-store.ts`
- Rust modules: `snake_case` (language standard)
- No `index.ts` barrel files unless explicitly needed for a public API surface

### TypeScript (Frontend)
- **Strict mode enabled.** No `any`, no `@ts-ignore` without an explanatory comment.
- All Tauri `invoke()` calls wrapped in typed functions inside `src/lib/tauri-commands.ts` — no scattered `invoke()` calls in components.
- Async functions return `Promise<T>` with explicit error handling. No unhandled promise rejections.
- Prefer `type` over `interface` for data shapes; `interface` only when extension is intended.
- No TypeScript `enum` — use `const` objects with `as const` instead.
- No implicit `undefined` — use explicit optional types.

### Rust (Backend)
- No `unwrap()` or `expect()` outside tests. Use `?` and typed errors.
- All Tauri commands are `async`. Return `Result<T, AppError>`. Never panic.
- No business logic inside `commands/`. Commands validate, delegate to services, map errors.
- `AppError` variants serialize as `{ code: string, message: string }` — maintain this contract.
- Run `cargo clippy --all-targets -- -D warnings` before marking Rust work complete.
- New dependencies: add via `cargo add <crate>` from `src-tauri/`, never hand-write a version into `Cargo.toml` or a spec — see `spec-rust-patterns.md` § "Adding Rust Dependencies".

### CSS / Styling
- **CSS Modules only.** No inline styles, no Tailwind, no styled-components.
- All color and spacing values use CSS custom properties from `src/styles/tokens.css`.
- No hardcoded hex values or pixel values in component CSS files.
- Terminal panel background is **always `#0D0D0D`** regardless of theme.

### Security
- `.pem` file path is stored via `tauri-plugin-store` (`connection-settings.json`). File content is read in Rust only — never pass file contents to the renderer.
- Passwords stored with Argon2id hash. Never log or expose plain-text credentials.
- All renderer capabilities declared explicitly in `src-tauri/capabilities/`.
- No embedded database (SQLite/`sqlx` removed from the architecture, 2026-06-23 — see `spec-architecture.md` § "SQLite removed, disk-based JSON adopted instead"). Script run-history and monitoring snapshots persist as plain JSON/JSONL files on disk — see `spec-backend.md` § "Script Run History" / "Monitoring Snapshots".

---

## Architecture Boundaries

```
Renderer (React/TS)  ──invoke()──▶  Commands (Rust)  ──▶  Services  ──▶  Disk (JSON/JSONL files)
                     ◀──events()──  Commands (Rust)
```

- Renderer never reads/writes the filesystem directly — script content, run-history logs, and monitoring snapshots all go through Rust commands. The one exception is `tauri-plugin-store`, which the renderer is allowed to call directly for small non-sensitive settings (e.g. connection string, `.pem` path).
- Renderer never reads `.pem` *file content* — only its path, via `tauri-plugin-store`.
- Services never import from `commands/`.
- `ssh/` module has zero Tauri dependencies — pure Rust.

---

## State Management

- **Zustand** for global app state. One store per domain.
- Tauri event listeners registered **once** at app mount in the store's `init()` action.
- Module-level boolean guard prevents React StrictMode double-registration of listeners.

---

## Terminal / PTY Rules

Full spec in `docs/spec-terminal.md`. Critical rules:

- PTY lifecycle: `pty_start` → `pty_write` → `pty_resize` → `pty_stop`. Backend (`portable-pty`, `russh` PTY channel) is unchanged.
- Frontend rendering is `@xterm/xterm` + `@xterm/addon-fit` (decision: 2026-06-11, see `spec-terminal.md`). No `value`/`onChange` on the terminal container — xterm.js owns input via `term.onData()` and output via `term.write()`.
- Do not reintroduce a custom ANSI/VT100 parser, manual `keyToEscapeSequence` map, or `outputChunks` array — these are superseded by xterm.js. The prior "no third-party ANSI library" rule no longer applies; `xterm.js` is an accepted dependency.
- ANSI SGR 33 → `#D4AF37` (gold) via xterm.js `ITheme`, not a custom converter.
- `drain_pty_buffer` called **once after the read loop**, never inside it.
- Script execution output is not a separate rendering target — it streams into the same interactive `xterm.js` `Terminal` instance the user already has open, via ordinary `pty:data` chunks. Do not build a second `Terminal` instance (read-only or otherwise) for it — see `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel".

---

## SSH Channel Architecture

- **Interactive terminal** — today this is a local PTY (`portable-pty`) running the system `ssh` binary as a subprocess, *not* a `russh` PTY+shell channel — that design in `spec-terminal.md` is an aspirational future direction, not current behavior. Connection state is detected heuristically from output text (`src/lib/ssh-utils.ts`), not from a session object.
- **Exec channels** (`russh`) — for all discrete, non-interactive commands. One new authenticated session + channel per command, never reused. `monitor_service.rs` is the reference implementation.
- **Script execution stays on the interactive channel** — a script run sends exactly one plain command line to the same PTY the user is looking at (e.g. `bash ~/.deploy-monitor/scripts/<hash>.sh`). Checking whether the script already exists on the instance and uploading it if not happen over their own exec/SFTP channel, completely separate from and invisible to the interactive terminal. Never inject a script's content (base64 or otherwise) into the interactive channel — see `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel" for why that was tried twice and rolled back both times.

---

## What NOT To Do

- ❌ TanStack Router, TanStack Query, or any TanStack package — firm decision, security incident.
- ❌ `shadcn/ui` — conflicts with the custom design system.
- ❌ TypeScript `enum` — use `const` + `as const`.
- ❌ Commit with `cargo clippy` warnings or TypeScript errors.
- ❌ Store secrets, tokens, or `.pem` content anywhere on disk — only non-sensitive paths/settings via `tauri-plugin-store`.
- ❌ Add an embedded database (SQLite or otherwise) — firm decision, 2026-06-23, see `spec-architecture.md` § "SQLite removed, disk-based JSON adopted instead".
- ❌ `localStorage` or `sessionStorage` — use `tauri-plugin-store` if renderer persistence is needed.
- ❌ Compliant responses — if an approach has problems, say so explicitly.

---

## Active Skills & Tools

| Tool | When to use |
|---|---|
| **Engram** (MCP) | Memory: session start/end, saving architectural decisions |
| **Security Guidelines** (plugin) | Always active — automatic |
| **Impeccable** | UI refinement: `/impeccable teach`, `/impeccable audit`, `/impeccable polish` |
| **Emil Kowalski** (skill) | When implementing animations from spec-frontend.md |
| **Graphify** | When project > 20 files: `/graphify .`, `/graphify query "..."` |
| **Cyber Neo** | Security audit before milestones: `/cyber-neo .` |

---

## Current Implementation Status

**Completed:**
- PTY terminal integration (`pty.rs`, `terminal-panel.tsx`, `use-terminal-store.ts`)
- SSH connection (`ssh_test_connection`, public key auth via `russh`, typed errors)
- Native `.pem` file picker via `tauri-plugin-dialog`
- Script local FS management (create/read/write/delete/rename) + SFTP upload/delete/rename sync to the instance, keyed by file name (`script_remote_service.rs`, `use-script-remote.ts`) — see `spec-backend.md` § "Script Remote Execution"
- Script execution on the interactive terminal (upload/verify/rename sync + run-on-terminal via the OSC end-marker) — see `spec-backend.md` § "Script Remote Execution"

**Next in queue:**
1. Settings screen
2. Script run-history persistence — one JSON file per execution under `<scripts_dir>/outputs/`, consumed by the already-built (mock-data) Historial view (`history.tsx` / `use-mock-history.ts`) — see `spec-backend.md` § "Script Run History"
3. Monitoring snapshot persistence — append-only JSONL day-files under `app_data_dir()/monitoring/`, to back the range tabs (30min/1h/6h/24h) in `monitor.tsx`, currently a "not implemented" stub — see `spec-backend.md` § "Monitoring Snapshots"

> Note (2026-06-23): "Import Claude Design layouts" and "Monitoring panel" from the previous version of this list appear to already be implemented (`src/pages/landing`, `src/pages/content/elements/{monitor,overview,scripts,settings}.tsx` all exist) — worth a dedicated pass to verify and update this status list, separate from the SQLite-removal work above.

---

## Running the Project

```bash
# Development
pnpm tauri dev

# Type check
pnpm tsc --noEmit

# Lint Rust
cargo clippy --all-targets -- -D warnings

# Format
pnpm prettier --write src/
cargo fmt

# Tests
cargo test
```