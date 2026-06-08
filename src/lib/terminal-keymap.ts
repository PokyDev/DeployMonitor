import type { KeyboardEvent } from 'react';

const KEY_MAP: Record<string, string> = {
  Enter: '\r',
  Backspace: '\x7f',
  Tab: '\t',
  Escape: '\x1b',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  Delete: '\x1b[3~',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
};

/** Maps a raw keydown event to the byte sequence the PTY expects, or null to ignore it. */
export function keyToEscapeSequence(e: KeyboardEvent): string | null {
  if (e.ctrlKey) {
    const code = e.key.toLowerCase().charCodeAt(0) - 96;
    if (code > 0 && code < 32) return String.fromCharCode(code);
  }

  return KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key : null);
}
