/**
 * ANSI/SGR truecolor builders for the terminal "lock screen" welcome message.
 * Written directly via term.write() — xterm.js's VT parser renders these
 * natively, no HTML/DOM conversion involved.
 */

const RESET = '\x1b[0m';
const ORANGE: [number, number, number] = [255, 107, 0]; // "deploy"
const GOLD: [number, number, number] = [212, 175, 55]; // "Terminal" — app gold-yellow
const DEFAULT_FG: [number, number, number] = [212, 208, 196]; // #D4D0C4 — xterm theme foreground
const BG: [number, number, number] = [13, 13, 13]; // #0D0D0D — terminal background
const WHITE: [number, number, number] = [255, 255, 255];

export const WELCOME_LINE_2_TEXT = 'Utiliza cualquier tecla para desbloquear la terminal';

function sgrTruecolor([r, g, b]: [number, number, number]): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

/** "Bienvenido, deployTerminal Ha Iniciado correctamente" with per-word colors. */
export function buildWelcomeLine1(): string {
  return (
    sgrTruecolor(DEFAULT_FG) +
    'Bienvenido, ' +
    sgrTruecolor(ORANGE) +
    'deploy' +
    sgrTruecolor(GOLD) +
    'Terminal' +
    sgrTruecolor(DEFAULT_FG) +
    ' Ha Iniciado correctamente' +
    RESET
  );
}

/**
 * Interpolates between the terminal background and white based on `t` (0..1).
 * Used to fake an "opacity" pulse for white text on a fixed-color background.
 */
export function interpolateOpacity(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const rgb: [number, number, number] = [
    Math.round(BG[0] + clamped * (WHITE[0] - BG[0])),
    Math.round(BG[1] + clamped * (WHITE[1] - BG[1])),
    Math.round(BG[2] + clamped * (WHITE[2] - BG[2])),
  ];
  return sgrTruecolor(rgb);
}

/**
 * Rewrites row 2 in place with the given color, without disturbing the
 * cursor used for subsequent writes (row 1 stays untouched).
 */
export function buildWelcomeLine2(colorEscape: string): string {
  return `\x1b[2;1H\x1b[2K${colorEscape}${WELCOME_LINE_2_TEXT}${RESET}`;
}
