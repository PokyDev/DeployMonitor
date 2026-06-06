# spec-navigation.md

Navigation structure, screen flows, and global app states for DeployMonitor.

---

## Product Context

Desktop app (Tauri V2) for developers and DevOps professionals to monitor and automate tasks on a cloud instance via SSH with `.pem` key authentication.

**MVP scope:**
- Single user profile per installation
- Single remote instance
- `.pem` key auth only (no password SSH)
- Local username/password auth (Argon2id hashed)
- Scripts defined locally, executed remotely via SSH
- Polling-based monitoring (no remote agent)

---

## Screen Hierarchy

```
/              → Landing
/login         → Login
/dashboard     → Dashboard (home)
/monitoring    → Monitoring Panel
/scripts       → Script Manager
/settings      → Settings
```

All post-login screens share the sidebar + titlebar + terminal panel layout.

---

## Screens

### Landing (`/`)

Single CTA: **"Access"** → `/login`

On load: if a valid local session exists, redirect immediately to `/dashboard` — skip landing and login.

Background decoration: subtle technical grid pattern (1px, `--border-subtle`, 40% opacity).

---

### Login (`/login`)

Centered form, max-width 400px.

| Field | Type | Validation |
|---|---|---|
| Username | text | required |
| Password | password (toggleable) | required |

**Scenarios:**
- No account exists → show prominent "Create account" CTA
- Wrong credentials → inline error: *"Incorrect username or password"*
- No account + login attempt → *"No account registered. Create one to continue."*

**Account creation** (modal from Login):
- Username: required, no spaces, min 3 chars
- Password: min 8 chars, 1 uppercase, 1 number; per-rule error messages
- Confirm password: must match
- On success → create profile in SQLite → redirect to `/dashboard`

On successful login: persist session flag in SQLite to skip login on next app open.

---

### Dashboard (`/dashboard`)

#### SSH Configuration Section
Shown prominently on first access. Always accessible.

- `.pem` path: input + "Browse" button (native file picker via `tauri-plugin-dialog`)
- SSH connection string: `user@host` or `user@ip` format, validated inline, `JetBrains Mono`
- **"Test Connection"** button:
  - During test: spinner + *"Verifying..."*
  - Success: green banner *"Connection established with [host]"*
  - Error: red banner with specific SSH error message
- **"Save Configuration"** button: enabled after successful test (or with warning if skipped)

Config is global and persists in SQLite across sessions.

#### Status Summary Section
Visible after connection is configured.

| Card | Content |
|---|---|
| Connection Status | Badge + hostname + session uptime |
| CPU | Current % + sparkline |
| Memory | Used / Total + progress bar |
| Disk | Used / Total + progress bar |
| Load Average | 1-min load avg |

Disconnected state: last known values in `--text-muted` + staleness label (*"5 min ago"*).

#### Quick Actions
- "Go to Scripts" → `/scripts`
- "View full monitoring" → `/monitoring`
- Last 3 executed scripts (name, status, timestamp) with re-run button

---

### Monitoring (`/monitoring`)

#### Header
Hostname · connection badge (pulse if connected) · Connect/Disconnect button · last update timestamp

#### Metric Cards (detailed)

| Metric | Detail |
|---|---|
| CPU | % with 30-min line chart |
| Memory RAM | Used / Total / % with chart |
| Disk | Used / Total / % (root partition) |
| Load Average | 1, 5, 15 minute values |

#### Historical Charts
- X axis: time (default 30 min, selector: 1h / 6h / 24h)
- Y axis: metric value
- Line color: `--color-gold` on semi-transparent dark background
- Data source: `metric_snapshots` from local SQLite

#### Monitoring Control
- Start / Stop polling from this screen
- Polling interval: 30 seconds (fixed in MVP)
- "Next update in X seconds" countdown indicator

**Empty state:** no data yet → illustration + *"Start monitoring to begin collecting metrics"* + Start button

---

### Scripts (`/scripts`)

#### Layout

```
┌──────────────┬────────────────────────────┐
│ Script List  │  Editor / Detail           │
│ (~280px)     │  (remaining width)         │
└──────────────┴────────────────────────────┘
```

#### Script List Panel

- "+ New Script" button at top
- Per item: name, type badge (`sync` / `custom`), last run timestamp, last run status indicator
- Hover: contextual actions (Edit, Delete)
- Selected item: gold left border

#### Editor / Detail Panel

**Empty state:** *"Select a script or create a new one"*

**Script selected:**

| Field | Type |
|---|---|
| Name | text input |
| Description | text input (optional) |
| Type | `sync` / `custom` radio or toggle |
| Content | textarea — `JetBrains Mono`, line numbers, dark background (always) |

**Actions:**
- **Save** (secondary) — persist to SQLite
- **Execute** (primary) — upload via SFTP + run via SSH
- **Cancel Execution** — visible only during active run

**Executing state:**
1. "Execute" button → "Executing…" with pulse animation
2. Terminal panel auto-expands
3. Output streams line-by-line via `script:output-line` events
4. On finish: success/error banner with exit code and duration

**Execution flow:**
```
User clicks Execute
  → invoke('script_run')
  → Backend uploads script via SFTP
  → Backend executes via SSH exec channel
  → Events stream to frontend (script:output-line × N)
  → Event: script:completed or script:error
  → Result saved to sync_history in SQLite
```

---

### Settings (`/settings`)

#### Appearance
- Theme toggle: Light / Dark / System
- Change is immediate with 200ms transition
- Persists in SQLite

#### SSH Connection
- Quick link to Dashboard SSH config section
- Shows current configured host or *"Not configured"*

#### Account
- Current username (read-only)
- **"Sign Out"** → clears session flag → redirect to Landing
- **"Change Password"** → modal: current password + new password + confirm

#### About
- App version
- Stack: Tauri V2, React, TypeScript, Rust

---

## Sidebar (all post-login screens)

Collapses to 56px (icons only).

| Item | Icon | Route | Badge |
|---|---|---|---|
| Dashboard | `home` | `/dashboard` | — |
| Monitoring | `activity` | `/monitoring` | Connection status |
| Scripts | `terminal` | `/scripts` | Running script count |
| Settings | `settings` | `/settings` | — (always at bottom) |

**Connection status indicator** (above Settings):
- 8px circle badge
- Pulsing gold = connected
- Idle gray = disconnected
- Error red = connection error

**Theme toggle** (above status indicator): sun/moon icon.

---

## Terminal Panel

Available on all post-login screens.

- Initial state: collapsed
- Auto-expands when a script starts executing
- Tabs: one per active or recent execution session (Chrome DevTools style)
- Output persists while app is open; resets on restart
- Full output history available in `sync_history`

---

## Global App States

| State | Description | Visual |
|---|---|---|
| `unauthenticated` | No local session | Redirect to Landing/Login |
| `authenticated:disconnected` | Logged in, no SSH | Gray sidebar badge, empty cards |
| `authenticated:connecting` | Logged in, SSH connecting | Pulsing gold badge, spinner |
| `authenticated:connected` | Logged in + SSH active | Pulsing gold badge, live metrics |
| `authenticated:error` | Logged in, SSH lost/failed | Red badge, non-blocking error banner |

State transitions driven by `instance:status-changed` Tauri events → update Zustand connection store → sidebar and dashboard cards react automatically.

---

## Scalability Notes (post-MVP)

These are already accounted for in the data model:

- **Multiple instances:** `instances` table supports N rows; sidebar can add an instance selector
- **Multiple users:** `users` table structure is already multi-user ready
- **Scheduled execution:** `sync_history.triggered_by` already distinguishes `manual` vs `scheduled`
- **Script parameters:** `scripts` table can be extended with `params: JSON`