/**
 * Helpers for the terminal unlock animation — the cosmetic "init" command
 * typed on the prompt after the HTML lock-screen overlay fades out.
 * The visual lock screen itself lives in terminal.tsx (HTML overlay) +
 * terminal.css, not here.
 */
import pkg from '../../package.json';

export const APP_VERSION: string = pkg.version;

/** ANSI Shadow ASCII art — DEPLOY block (50 cols × 6 rows). */
export const TLS_DEPLOY = [
  '██████╗ ███████╗██████╗ ██╗      ██████╗ ██╗   ██╗',
  '██╔══██╗██╔════╝██╔══██╗██║     ██╔═══██╗╚██╗ ██╔╝',
  '██║  ██║█████╗  ██████╔╝██║     ██║   ██║ ╚████╔╝ ',
  '██║  ██║██╔══╝  ██╔═══╝ ██║     ██║   ██║  ╚██╔╝  ',
  '██████╔╝███████╗██║     ███████╗╚██████╔╝   ██║   ',
  '╚═════╝ ╚══════╝╚═╝     ╚══════╝ ╚═════╝    ╚═╝   ',
].join('\n');

/** ANSI Shadow ASCII art — MONITOR block (60 cols × 6 rows). */
export const TLS_MONITOR = [
  '███╗   ███╗ ██████╗ ███╗   ██╗██╗████████╗ ██████╗ ██████╗ ',
  '████╗ ████║██╔═══██╗████╗  ██║██║╚══██╔══╝██╔═══██╗██╔══██╗',
  '██╔████╔██║██║   ██║██╔██╗ ██║██║   ██║   ██║   ██║██████╔╝',
  '██║╚██╔╝██║██║   ██║██║╚██╗██║██║   ██║   ██║   ██║██╔══██╗',
  '██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║   ██║   ╚██████╔╝██║  ██║',
  '╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝',
].join('\n');

/** Fake command "typed" by the unlock animation — purely cosmetic, never sent to the shell. */
export const UNLOCK_COMMAND = 'init';

/** Fake output line printed after `UNLOCK_COMMAND` by the unlock animation. */
export const UNLOCK_OUTPUT_TEXT = 'Terminal desbloqueada, ya puedes usarla';

const RESET = '\x1b[0m';
const GOLD: [number, number, number] = [212, 175, 55];
const GREEN: [number, number, number] = [61, 158, 104];

function sgrTruecolor([r, g, b]: [number, number, number]): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** `UNLOCK_OUTPUT_TEXT` in the theme's "success" green (SGR 32). */
export function buildUnlockOutputLine(): string {
  return `${sgrTruecolor(GREEN)}${UNLOCK_OUTPUT_TEXT}${RESET}`;
}

/** Re-wraps a plain-text prompt line (captured from the xterm buffer) in the prompt's gold color. */
export function buildUnlockPrompt(promptText: string): string {
  return `${sgrTruecolor(GOLD)}${promptText}${RESET} `;
}
