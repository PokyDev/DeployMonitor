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

  ![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square)
  ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
  ![Status](https://img.shields.io/badge/Status-Active%20Development-orange?style=flat-square)

  <br />
</div>

---

## What is DeployMonitor?

**DeployMonitor** is a cross-platform desktop application built with [Tauri V2](https://v2.tauri.app/) that centralizes SSH-based cloud infrastructure management in a single, secure, and fast native app.

Connect to remote servers over SSH, monitor live metrics from a visual dashboard, run automation scripts with real-time streaming output, and interact directly through an integrated PTY terminal — all without leaving your desktop.

> Credentials are stored locally using **Argon2id** hashing. `.pem` keys are never exposed to the renderer layer. All sensitive file operations happen exclusively in Rust.

---

## Features

- **SSH Connection Management** — Connect to cloud instances using password or public key (`.pem`) authentication via [russh](https://github.com/warp-tech/russh), a pure-Rust SSH implementation.
- **Live Monitoring Dashboard** — Real-time CPU, memory, and system metrics visualized with interactive charts.
- **Remote Script Execution** — Upload and run automation scripts on remote instances with live streaming output.
- **Integrated PTY Terminal** — Full pseudo-terminal emulation with ANSI color support, keyboard shortcuts, and resize handling.
- **Auto-Updates** — Cryptographically verified background updates via `tauri-plugin-updater`.
- **Secure by Default** — No secrets leave the Rust core. Renderer has no FS access, no direct DB access, and no raw `.pem` content.

---

## Architecture

DeployMonitor follows a strict three-layer model enforced at the module boundary:

```
┌──────────────────────────────────────────────┐
│  CLIENT  — React 19 / TypeScript / WebView   │
│  UI, state (Zustand), routing (Wouter)        │
├──────────────────────────────────────────────┤
│  CORE  — Rust / Tauri V2 Commands            │
│  SSH sessions, PTY, credentials, file I/O     │
├──────────────────────────────────────────────┤
│  DATA  — SQLite / sqlx (async)               │
│  Instances, credentials, settings             │
└──────────────────────────────────────────────┘
```

- The **Client** communicates with Core exclusively via `invoke()` (commands) and `listen()` (events).
- The **Core** owns all business logic, SSH sessions, and sensitive file reads.
- The **Data** layer is accessed only from Core — never from the renderer.

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
| Database | `sqlx` (SQLite, async) | 0.9.0 |
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
| `tauri-plugin-dialog` | 2.7.1 | Native OS file picker for `.pem` selection |
| `tauri-plugin-updater` | 2.10.1 | Auto-update with cryptographic signature verification |
| `tauri-plugin-process` | 2.3.1 | App restart after update |
| `tauri-plugin-log` | 2.8.0 | Unified renderer + Rust logging |
| `tauri-plugin-os` | 2.3.2 | OS detection for platform-specific behavior |

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
| Credential storage | Argon2id hash in local SQLite — never plain-text |
| `.pem` files | Path stored in DB; file read in Rust only — never passed to renderer |
| Renderer capabilities | Declared explicitly in `src-tauri/capabilities/` |
| IPC surface | Typed `invoke()` wrappers only — no raw calls in components |
| Local storage | No `localStorage` / `sessionStorage` — `tauri-plugin-store` if needed |

---

## Platform Support

| Platform | Status |
|---|---|
| macOS | Primary target |
| Windows | Supported |
| Linux | Supported (requires WebKitGTK) |

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with Tauri V2 · React 19 · Rust · Open Source</sub>
</div>
