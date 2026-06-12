import type { ITheme } from '@xterm/xterm';

/**
 * Maps the design system's terminal palette to xterm.js's `ITheme`.
 * Background is hardcoded to #0D0D0D — exempt from theming, per CLAUDE.md.
 */
export function buildTheme(): ITheme {
  return {
    background: '#0D0D0D',
    foreground: '#D4D0C4',  // SGR 0 — reset/default
    cursor: '#D4AF37',
    yellow: '#D4AF37',      // SGR 33 — gold, prompt/commands
    green: '#3D9E68',       // SGR 32 — success
    red: '#C4394D',         // SGR 31 — error
    blue: '#2874A6',        // SGR 34 — info
    brightBlack: '#555555', // SGR 90 — muted
  };
}
