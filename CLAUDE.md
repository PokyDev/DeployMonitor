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
| Rust commands / services / DB | `docs/spec-backend.md` |
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

### CSS / Styling
- **CSS Modules only.** No inline styles, no Tailwind, no styled-components.
- All color and spacing values use CSS custom properties from `src/styles/tokens.css`.
- No hardcoded hex values or pixel values in component CSS files.
- Terminal panel background is **always `#0D0D0D`** regardless of theme.

### Security
- `.pem` file path is stored in SQLite. File is read in Rust only — never pass file contents to the renderer.
- Passwords stored with Argon2id hash. Never log or expose plain-text credentials.
- All renderer capabilities declared explicitly in `src-tauri/capabilities/`.

---

## Architecture Boundaries

```
Renderer (React/TS)  ──invoke()──▶  Commands (Rust)  ──▶  Services  ──▶  Repositories
                     ◀──events()──  Commands (Rust)
```

- Renderer never accesses SQLite directly.
- Renderer never reads `.pem` files.
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

- PTY lifecycle: `pty_start` → `pty_write` → `pty_resize` → `pty_stop`
- Raw keydown events map to escape sequences in `terminal-panel.tsx` — no `value`/`onChange` on the terminal container.
- Output chunk array capped at **2000 entries**.
- ANSI SGR 33 → `#D4AF37` (gold) in ANSI-to-HTML converter.
- `drain_pty_buffer` called **once after the read loop**, never inside it.

---

## SSH Channel Architecture

- **PTY + shell channel** for interactive sessions (welcome banner, prompt).
- **Exec channels** for all discrete commands — prevents echo duplication.
- Never reuse an exec channel. Open a new one per command.

---

## What NOT To Do

- ❌ TanStack Router, TanStack Query, or any TanStack package — firm decision, security incident.
- ❌ `shadcn/ui` — conflicts with the custom design system.
- ❌ TypeScript `enum` — use `const` + `as const`.
- ❌ Commit with `cargo clippy` warnings or TypeScript errors.
- ❌ Store secrets, tokens, or `.pem` content in SQLite — paths only.
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
- SQLite schema with migrations (`sqlx`)

**Next in queue:**
1. Import Claude Design layouts (titlebar done manually by developer)
2. Monitoring panel — dashboard summary cards + full monitoring view
3. Script management — local script FS, upload, remote execution with streaming output
4. Settings screen

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