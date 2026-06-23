# spec-architecture.md

Architecture and stack for DeployMonitor / SSH Manager.
**Tauri V2 · React 19 · TypeScript · Vite 7 · Rust**

---

## Three-Layer Model

```
┌─────────────────────────────────────┐
│  CLIENT  — React/TS · WebView       │
├─────────────────────────────────────┤
│  CORE    — Rust · Tauri commands    │
├─────────────────────────────────────┤
│  DATA    — SQLite · sqlx            │
└─────────────────────────────────────┘
```

**Client** handles all UI and user interaction. Communicates with Core via `invoke()` (commands) and `listen()` (events) exclusively. No direct FS or OS access.

**Core** owns all business logic, SSH sessions, credential handling, and `.pem` file reads. The only layer that opens sockets or reads sensitive files.

**Data** is SQLite local, async via `sqlx`. Accessed only from Core — never from the Client.

---

## Frontend Stack

| Category | Library | Version |
|---|---|---|
| Framework | React | 18.x |
| Language | TypeScript | 5.x (strict) |
| Build tool | Vite | 5.x |
| Router | Wouter | 3.x |
| Global state | Zustand | 4.x |
| Accessible primitives | Radix UI Primitives | latest |
| Icons | Lucide React | latest |
| Charts | Recharts | 2.x |
| Styling | CSS Modules + CSS custom properties | — |
| Terminal rendering | `@xterm/xterm` + `@xterm/addon-fit` | latest |

**Why TypeScript over JavaScript:** Stronger alignment with Rust's typed contracts. Tauri `invoke()` return types can be shared or mirrored precisely. Async/await patterns with `Promise<T>` eliminate a class of runtime errors that were surfacing in the PTY/SSH integration.

**Router note:** Wouter covers all MVP routes. TanStack ecosystem is **permanently off-limits** due to a supply-chain security incident — this is not a preference.

**Radix UI usage:** Only for components requiring complex ARIA behavior (Dialog, DropdownMenu, Tabs, Toggle). All visual components are custom, following `spec-frontend.md`.

---

## Backend Stack (Rust)

| Category | Crate | Version |
|---|---|---|
| Desktop framework | `tauri` | v2.x |
| SSH | `russh` | 0.44.x |
| SFTP | `russh-sftp` | companion |
| PTY | `portable-pty` | 0.8 |
| Database | `sqlx` (SQLite, async) | 0.7.x |
| Serialization | `serde` + `serde_json` | 1.x |
| Password hashing | `argon2` | 0.5.x |
| Error handling | `thiserror` + `anyhow` | 1.x |
| Async runtime | `tokio` | 1.x |
| Logging | `tracing` + `tracing-subscriber` | 0.1.x |
| UUIDs | `uuid` | 1.x |
| Dates | `chrono` | 0.4.x |

**`russh` over `libssh2-sys`:** Rust-pure, no C FFI, no cross-compilation issues.
**`argon2` over bcrypt:** OWASP-recommended, hardware-attack resistant.

**`@xterm/xterm` over a custom ANSI/VT100 parser (2026-06-11):** The frontend originally rendered PTY/SSH output through a hand-written SGR-only ANSI-to-HTML converter. That converter cannot interpret cursor-positioning or alt-screen sequences, so any interactive program (`vim`, `htop`, `less`, `nano`, package-manager menus) renders as garbled text instead of a redrawn screen. `portable-pty` and the `russh` PTY channel are unaffected — they still emit raw byte streams. Only the frontend consumer changed. See `spec-terminal.md` § "Architecture Decision: xterm.js" for the full rationale and migration notes.

**Script execution stays on the interactive channel, not a separate exec channel (2026-06-22):** Two earlier attempts ran a script's content through the interactive terminal's PTY itself (base64-over-`ptyWrite`, then the same wrapped in `stty -echo` + an OSC marker) to avoid building a second output channel. Both leaked visible artifacts because that PTY echoes back anything written to it exactly as if typed — there's no way to inject a payload through it invisibly. The fix moves the *payload* (uploading the script) to a separate, invisible `russh` side-channel that never touches the terminal, while keeping *execution* — a single one-line command — on the interactive channel the user already has open, so output still streams live with normal xterm styling. See `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel" and `spec-backend.md` § "Script Remote Execution".

---

## Tauri Plugins

| Plugin | Purpose |
|---|---|
| `tauri-plugin-dialog` | Native OS file picker for `.pem` selection |
| `tauri-plugin-updater` | Auto-update with cryptographic signature verification |
| `tauri-plugin-process` | App restart after update |
| `tauri-plugin-log` | Unified renderer + Rust logging |
| `tauri-plugin-os` | OS detection for platform-specific behavior |

---

## Directory Structure

```
deploy-monitor/
├── src/                          # Client layer
│   ├── main.tsx
│   ├── app.tsx
│   ├── pages/
│   │   ├── landing.tsx
│   │   ├── login.tsx
│   │   ├── dashboard.tsx
│   │   ├── monitoring.tsx
│   │   ├── scripts.tsx
│   │   └── settings.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── titlebar.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── terminal-panel.tsx
│   │   ├── ui/                   # Custom design system components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── card.tsx
│   │   │   └── status-indicator.tsx
│   │   ├── primitives/           # Radix UI wrappers
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── toggle.tsx
│   │   ├── monitoring/
│   │   │   ├── metric-card.tsx
│   │   │   └── metric-chart.tsx
│   │   └── scripts/
│   │       ├── script-list.tsx
│   │       └── script-editor.tsx
│   ├── stores/
│   │   ├── use-connection-store.ts
│   │   ├── use-script-store.ts
│   │   ├── use-monitor-store.ts
│   │   └── use-ui-store.ts
│   ├── hooks/
│   │   ├── use-tauri-event.ts
│   │   ├── use-ssh-connection.ts
│   │   └── use-script-runner.ts
│   ├── lib/
│   │   ├── tauri-commands.ts     # All invoke() wrappers — typed
│   │   └── formatters.ts
│   └── styles/
│       ├── tokens.css
│       ├── global.css
│       └── fonts.css
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── errors.rs
│   │   ├── commands/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── models/
│   │   ├── ssh/
│   │   └── db/
│   │       └── migrations/
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── public/
│   └── fonts/
│       ├── IBMPlexMono/
│       ├── Geist/
│       └── JetBrainsMono/
│
├── CLAUDE.md
├── docs/
│   ├── spec-architecture.md     ← this file
│   ├── spec-frontend.md
│   ├── spec-backend.md
│   ├── spec-navigation.md
│   └── spec-rust-patterns.md
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## IPC Communication

### Client → Core (invoke)

```typescript
// src/lib/tauri-commands.ts
import { invoke } from '@tauri-apps/api/core'
import type { ConnectionStatus, CommandOutput } from '@/types'

export async function sshConnect(instanceId: string): Promise<ConnectionStatus> {
  return invoke<ConnectionStatus>('ssh_connect', { instanceId })
}
```

All `invoke()` calls are centralized here. No scattered `invoke()` calls across components.

### Core → Client (events)

```typescript
// Pattern used in Zustand stores
import { listen } from '@tauri-apps/api/event'

// Registered once in store init(), guarded against StrictMode double-mount
let _isListening = false

export const useMonitorStore = create<MonitorStore>((set) => ({
  metrics: null,
  init: async () => {
    if (_isListening) return
    _isListening = true
    await listen<MetricSnapshot>('monitor:metrics_update', (event) => {
      set({ metrics: event.payload })
    })
  }
}))
```

---

## Platform Targets

| Platform | Status | Notes |
|---|---|---|
| macOS | Primary | Native traffic light controls, titlebar drag region |
| Windows | Supported | Custom window controls, `\` path separators handled in Rust |
| Linux | Supported | WebKitGTK; may need system deps on some distros |

---

## Key Decisions Log

| Decision | Rejected alternative | Reason |
|---|---|---|
| TypeScript | JavaScript | Type safety across Tauri IPC boundary; async/await safety with PTY/SSH |
| Wouter | TanStack Router | Supply-chain security incident in TanStack ecosystem |
| Radix UI (selective) | shadcn/ui | shadcn's visual system conflicts with custom design tokens |
| `russh` | `libssh2-sys` | Rust-pure, no C deps, portable |
| Argon2id | bcrypt | OWASP recommended, GPU-resistant |
| CSS Modules | Tailwind | Design token system requires precise CSS custom property control |
| `tauri-plugin-dialog` | Third-party dialogs | Official plugin, `.pem` path never touches renderer |
| Script execution on interactive channel | Separate exec-channel execution + read-only output viewer | base64-over-PTY and `stty`+OSC bracketing both leaked visible artifacts; payload injection on the interactive channel is fundamentally indistinguishable from typed input — see `spec-terminal.md` § "Architecture Decision: script execution stays on the interactive channel" |