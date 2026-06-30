<div align="center">
  <br />
  <img src="public/icon/ssh-manager-icon.png" alt="DeployMonitor" width="128" />
  <br /><br />

  <h1>DeployMonitor</h1>

  <p>
    Desktop app for SSH-based cloud instance management, real-time monitoring,<br />
    and remote script automation — open source, secure by design.
  </p>

  <br />

  ![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)
  ![React](https://img.shields.io/badge/React-19.1-61DAFB?style=for-the-badge&logo=react&logoColor=black)
  ![Rust](https://img.shields.io/badge/Rust-2021-CE422B?style=for-the-badge&logo=rust&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

  <br /><br />

  ![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11%20x64-lightgrey?style=flat-square)
  ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
  ![Status](https://img.shields.io/badge/Status-v0.1.0--beta%20%E2%80%94%20Initial%20Release-brightgreen?style=flat-square)
  ![Release](https://img.shields.io/badge/Ciclo%20inicial-Completado%2029%2F06%2F2026-blue?style=flat-square)

  <br />
</div>

---

## What is DeployMonitor?

**DeployMonitor** is a Windows desktop application built with [Tauri V2](https://v2.tauri.app/) for personal use — it centralizes SSH-based cloud instance management and script automation in a single, secure, and fast native app.

Connect to remote servers over SSH, execute automation scripts with real-time terminal output, and review the full execution history with ANSI color support — all from your Windows desktop without a browser.

> `.pem` keys are never exposed to the renderer layer. All sensitive file operations happen exclusively in Rust. Settings persist locally via `tauri-plugin-store`.

**v0.1.0-beta** marks the completion of the initial development cycle. See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for the full feature list and installation instructions.

---

## Features

- **SSH Connection Management** — Connect to cloud instances using public key (`.pem`) authentication via [russh](https://github.com/warp-tech/russh), a pure-Rust SSH implementation.
- **Remote Script Execution** — Upload and run automation scripts on remote instances with live streaming output directly in the interactive terminal.
- **Execution History** — Full log of every script run, persisted to disk as JSON with exit code, duration, and complete ANSI output. Viewable with real color rendering.
- **Integrated PTY Terminal** — Full pseudo-terminal emulation with ANSI/SGR color support (`xterm.js`), keyboard shortcuts, and resize handling.
- **Script Management** — Create, edit, rename, and delete scripts locally with automatic SFTP sync to the remote instance.
- **Secure by Default** — No secrets leave the Rust core. Renderer has no direct FS access and no raw `.pem` content.

---

## Architecture

DeployMonitor follows a strict three-layer model enforced at the module boundary:

```
┌──────────────────────────────────────────────┐
│  CLIENT  — React 19 / TypeScript / WebView   │
│  UI, state (Zustand), routing (Wouter)        │
├──────────────────────────────────────────────┤
│  CORE  — Rust / Tauri V2 Commands            │
│  SSH sessions, PTY, script sync, file I/O     │
├──────────────────────────────────────────────┤
│  DATA  — JSON / JSONL files on disk          │
│  Script run history, monitoring snapshots     │
└──────────────────────────────────────────────┘
```

- The **Client** communicates with Core exclusively via `invoke()` (commands) and `listen()` (events).
- The **Core** owns all business logic, SSH sessions, and sensitive file reads.
- The **Data** layer is plain JSON/JSONL files — no embedded database.

---

## Tech Stack

### Frontend

| Category | Library | Version |
|---|---|---|
| Framework | React | 19.1.0 |
| Language | TypeScript | 5.8.3 |
| Build Tool | Vite | 7.0.4 |
| Desktop Runtime | Tauri API | 2.x |
| Router | Wouter | 3.10.0 |
| Global State | Zustand | 5.0.14 |
| Charts | Recharts | 3.8.1 |
| Icons | Lucide React | 1.17.0 |
| Accessible Primitives | Radix UI (Dialog, DropdownMenu, Tabs, Toggle) | 1.x |
| Styling | CSS Modules + CSS Custom Properties | — |

### Backend (Rust)

| Category | Crate | Version |
|---|---|---|
| Desktop Framework | `tauri` | 2.x |
| SSH Client | `russh` | 0.46 |
| SFTP | `russh-sftp` | 2.x |
| PTY | `portable-pty` | 0.9.0 |
| Persistence | JSON / JSONL files on disk | — |
| Serialization | `serde` + `serde_json` | 1.x |
| Password Hashing | `argon2` | 0.5.3 |
| Error Handling | `thiserror` + `anyhow` | 2.0.18 / 1.0.102 |
| Async Runtime | `tokio` | 1.52.3 |
| Logging | `tracing` + `tracing-subscriber` | 0.1.44 / 0.3.23 |
| UUIDs | `uuid` | 1.23.2 |
| Date/Time | `chrono` | 0.4.45 |

### Tauri Plugins

| Plugin | Version | Purpose |
|---|---|---|
| `tauri-plugin-dialog` | 2.x | Native OS file/folder picker |
| `tauri-plugin-store` | 2.x | Renderer-side key/value persistence (paths, settings) |
| `tauri-plugin-log` | 2.x | Unified renderer + Rust logging |
| `tauri-plugin-os` | 2.x | OS detection for platform-specific behavior |

---

## Project Structure

```
deploy-monitor/
├── src/                          # Client layer (React/TypeScript)
│   ├── pages/                    # Route-level screens
│   │   ├── dashboard.tsx
│   │   ├── monitoring.tsx
│   │   ├── scripts.tsx
│   │   └── settings.tsx
│   ├── components/
│   │   ├── layout/               # Titlebar, sidebar, terminal panel
│   │   ├── ui/                   # Custom design system components
│   │   ├── primitives/           # Radix UI wrappers
│   │   ├── monitoring/           # Metric cards and charts
│   │   └── scripts/              # Script list and editor
│   ├── stores/                   # Zustand stores (one per domain)
│   ├── hooks/                    # Custom React hooks
│   ├── lib/
│   │   └── tauri-commands.ts     # All invoke() wrappers — typed, centralized
│   └── styles/
│       └── tokens.css            # Design tokens (colors, spacing, typography)
│
├── src-tauri/
│   ├── src/
│   │   ├── commands/             # Tauri command handlers (thin, no logic)
│   │   ├── services/             # Business logic
│   │   ├── repositories/         # Database access layer
│   │   ├── models/               # Shared data types
│   │   ├── ssh/                  # Pure Rust SSH/PTY module (no Tauri deps)
│   │   └── db/migrations/        # sqlx migrations
│   ├── capabilities/             # Tauri V2 capability declarations
│   └── tauri.conf.json
│
├── docs/                         # Architecture and feature specs
├── public/
│   ├── icon/
│   └── fonts/                    # IBM Plex Mono, Geist, JetBrains Mono
└── CLAUDE.md                     # Agent development guidelines
```

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- [Tauri V2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Development

```bash
# Install dependencies
pnpm install

# Start dev server (hot-reload for both frontend and Rust)
pnpm tauri dev
```

### Build

```bash
# Production build
pnpm tauri build
```

### Quality

```bash
# TypeScript type check
pnpm tsc --noEmit

# Rust lint (must pass before any commit)
cargo clippy --all-targets -- -D warnings

# Format
pnpm prettier --write src/
cargo fmt

# Tests
cargo test
```

---

## Security Model

| Concern | Approach |
|---|---|
| `.pem` files | Path stored via `tauri-plugin-store`; file content read in Rust only — never passed to renderer |
| Renderer capabilities | Declared explicitly in `src-tauri/capabilities/` |
| IPC surface | Typed `invoke()` wrappers only in `src/lib/tauri-commands.ts` — no raw calls in components |
| Local storage | No `localStorage` / `sessionStorage` — `tauri-plugin-store` for renderer persistence |
| Secrets | No plain-text credentials on disk. No embedded database. |

---

## Platform Support

| Platform | Status |
|---|---|
| Windows 10 / 11 x64 | Supported — primary target |
| macOS / Linux | Not tested in this release |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with Tauri V2 · React 19 · Rust · Open Source</sub>
</div>
