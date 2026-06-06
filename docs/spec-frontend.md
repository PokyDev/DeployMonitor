# spec-frontend.md

Visual design system and component rules for DeployMonitor.
All components use **TypeScript (.tsx)**, **CSS Modules**, and **CSS custom properties**.

---

## Design Concept

**"Refined Terminal"** — industrial precision meets professional tooling. High information density (GitHub Actions, Datadog) elevated with editorial typography and gold as the single warm accent. Every element communicates control, precision, and trust.

---

## Color Tokens

Defined in `src/styles/tokens.css`. **No hex values in component files.**

### Light Theme (`:root`)

```css
:root {
  --bg-base: #F5F4F0;
  --bg-surface: #FFFFFF;
  --bg-elevated: #FAFAF8;
  --bg-overlay: #F0EFE9;
  --border-subtle: #E8E6DF;
  --border-default: #D4D0C4;
  --border-strong: #B8B3A0;
  --text-primary: #111111;
  --text-secondary: #5A5A5A;
  --text-muted: #A0A0A0;
  --text-code: #8B6914;
}
```

### Dark Theme (`[data-theme="dark"]`)

```css
[data-theme="dark"] {
  --bg-base: #111111;
  --bg-surface: #1A1A1A;
  --bg-elevated: #222222;
  --bg-overlay: #2A2A2A;
  --border-subtle: #2E2E2E;
  --border-default: #3D3D3D;
  --border-strong: #555555;
  --text-primary: #F0F0F0;
  --text-secondary: #9A9A9A;
  --text-muted: #555555;
  --text-code: #D4AF37;
}
```

### Brand & Semantic Tokens (both themes)

```css
/* Brand */
--color-gold: #D4AF37;
--color-ink: #111111;
--color-white: #FFFFFF;

/* Semantic states */
--color-success: #2D7A4F;
--color-success-light: #3D9E68;
--color-error: #9B2335;
--color-error-light: #C4394D;
--color-warning: #8B6914;
--color-running: #D4AF37;
--color-idle: #3D3D3D;
--color-info-light: #2874A6;

/* Shadows */
--shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);
--shadow-gold: 0 2px 8px rgba(212,175,55,0.3);

/* Animation */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--duration-fast: 150ms;
--duration-base: 250ms;
--duration-slow: 350ms;
```

**Gold discipline:** Gold is used only for — primary action buttons, active connection indicator, running state, selected item highlight, left border on important notifications, code/command text in terminal.

---

## Typography

Fonts served locally from `public/fonts/`. No network requests.

| Role | Family | Weights |
|---|---|---|
| Display / Headings | IBM Plex Mono | 400, 500 |
| UI / Body | Geist | 400, 500, 600 |
| Code / Terminal | JetBrains Mono | 400, 700 |

```css
--font-display: 'IBM Plex Mono', monospace;
--font-ui: 'Geist', sans-serif;
--font-code: 'JetBrains Mono', monospace;
```

### Type Scale

```css
--text-xs:   11px;  /* Metadata labels, timestamps */
--text-sm:   13px;  /* Secondary text, badges */
--text-base: 15px;  /* Body, inputs */
--text-md:   17px;  /* Section subtitles */
--text-lg:   20px;  /* Panel titles */
--text-xl:   26px;  /* Page titles */
--text-2xl:  34px;  /* Display (Landing) */
```

### Typography Rules
- Section headings → `IBM Plex Mono` weight 500, `letter-spacing: -0.02em`
- UI labels, buttons, badges → `Geist` weight 600, uppercase, `letter-spacing: 0.06em`, 11px
- Paths, commands, outputs, code → `JetBrains Mono`

---

## Spacing

Base 4px system. Use tokens — no raw pixel values in CSS Modules.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;  --space-4: 16px;
--space-5: 20px;  --space-6: 24px;  --space-8: 32px;  --space-10: 40px;
--space-12: 48px; --space-16: 64px;
```

Border radius tokens:
```css
--radius-sm: 3px;  --radius-md: 4px;  --radius-lg: 6px;  --radius-xl: 8px;
```

---

## Layout

```
┌────────────────────────────────────────────────────┐
│              TITLEBAR (36px, draggable)             │
├───────────┬────────────────────────────────────────┤
│           │                                        │
│  SIDEBAR  │         CONTENT AREA                   │
│  (220px)  │         (padding: var(--space-6))      │
│           │                                        │
│           ├────────────────────────────────────────┤
│           │   TERMINAL PANEL (collapsible)         │
└───────────┴────────────────────────────────────────┘
```

- Sidebar: 220px fixed, collapses to 56px (icons only)
- Terminal panel: resizable, min 120px, max 50% window height
- Always dark (`#0D0D0D`) regardless of active theme

---

## Component Specs

### Button

```tsx
type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'
type ButtonState = 'default' | 'running' | 'loading'
```

| Variant | Background | Text | Border |
|---|---|---|---|
| primary | `--color-gold` | `#111111` (always) | none |
| secondary | transparent | `--text-primary` | `--border-default` |
| destructive | transparent | `--color-error-light` | `--color-error` |
| ghost | transparent | `--text-secondary` | none |

- Padding: `10px 20px`
- Border radius: `var(--radius-md)`
- Primary hover: `brightness(1.1)` + `var(--shadow-gold)`
- Running state: gold pulse animation on border, text → "Executing…" with mono spinner

### Input

- Height: 38px
- Background: `--bg-base`
- Border: `1px solid var(--border-default)`
- Focus: border `--color-gold` + `box-shadow: 0 0 0 2px rgba(212,175,55,0.15)`
- Error: border `--color-error-light`
- File path input: text in `JetBrains Mono` after selection

### Badge / Status Indicator

```
● Connected    → --color-gold (soft pulse)
● Disconnected → --color-idle
● Error        → --color-error-light
● Running      → --color-gold (pulse + animation)
● Completed    → --color-success-light
● Queued       → --text-secondary
```

Badge text: `Geist` 600, 10px, uppercase, `letter-spacing: 0.08em`, `padding: 3px 8px`, `border-radius: var(--radius-sm)`, background at 15% opacity.

### Terminal Panel

- Background: **always `#0D0D0D`** — never changes with theme
- Font: `JetBrains Mono` 400, 13px
- Stdout: `#D4D0C4`
- Stderr: `--color-error-light`
- Commands (prefixed `$`): `--color-gold`
- System/info: `--color-info-light`
- Success: `--color-success-light`
- Scrollbar: 4px wide, `--border-default` / `--border-strong` on hover

### Monitoring Cards

- Border radius: `var(--radius-lg)`
- Border: `1px solid var(--border-subtle)`
- Padding: `var(--space-5)`
- Metric value: `IBM Plex Mono` 500, `--text-xl`
- Metric label: `Geist` 600, uppercase, 10px, `--text-secondary`
- Sparklines: gold stroke on semi-transparent background

---

## Theme System

- Theme attribute: `data-theme="light" | "dark"` on `<html>`
- Default: follows `prefers-color-scheme`
- Toggle: bottom of sidebar (sun/moon icon)
- Transition: `background-color 200ms, color 200ms` on all token-using elements
- Terminal panel is **exempt** — always dark

---

## Iconography

- **Lucide React** — linear style, `strokeWidth={1.5}`, 18px sidebar / 16px inline
- Default color: `--text-secondary`
- Active: `--text-primary`
- Primary actions: `--color-gold`
- No filled icons — maintain linear consistency

---

## Animations

| Event | Animation |
|---|---|
| SSH connect success | Green border flash + gold badge fade-in |
| Script execute | Button `scale(0.97)` → "Running" state + indicator pulse |
| Terminal output | Lines enter `translateY(4px) → 0` + `opacity 0 → 1` |
| Sidebar item hover | Left border `scaleY(0) → scaleY(1)` |
| Theme toggle | `200ms` bg + color transition |
| Panel collapse | `height` animated `250ms ease` |
| Metric update | Numeric flip animation |

All animations respect `prefers-reduced-motion` — provide no-motion fallback.

---

## Accessibility

- Minimum contrast: **4.5:1** (WCAG AA) — both themes validated
- Gold `#D4AF37` on `#111111` → **8.4:1** ✓
- All interactive elements have `:focus-visible` with 2px gold outline
- Errors communicate via icon + text, never color alone
- Minimum click target: 32×32px