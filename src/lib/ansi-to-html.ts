/**
 * Minimal terminal emulation for the local PTY — interprets the cursor and
 * line-editing escape sequences PSReadLine emits while redrawing the input
 * line (hide/show cursor, erase-in-line, absolute/relative cursor moves) so
 * a redraw overwrites the line in place instead of leaking raw escape codes
 * or duplicated fragments into the scrollback. Deliberately not a third-party
 * library: SGR 33 maps to the design system's gold accent, SGR 32 to the
 * success palette used for synthetic system messages (e.g. the "CLS ejecutado
 * correctamente" line).
 */
const SGR_MAP: Record<number, string> = {
  0: 'color: #D4D0C4',
  1: 'font-weight: bold',
  33: 'color: #D4AF37',
  32: 'color: #3D9E68',
  31: 'color: #C4394D',
  34: 'color: #2874A6',
  90: 'color: #555555',
};

/** Caret marking the user's input position — `user-select: none` keeps it out of copies. */
const CURSOR_HTML = '<span class="terminal__cursor" aria-hidden="true">|</span>';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

type Cell = { char: string; style: string | null };

/** One escape sequence (CSI, OSC, charset, single-char) or a run of plain characters. */
const TOKEN_PATTERN =
  /\x1b\[(?<params>[0-9;?]*)(?<final>[A-Za-z])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()#][0-9A-Za-z]|\x1b[c78=>DEHM]|(?<text>[^\x1b]+)/g;

/**
 * One logical line as a row of cells. The shell's line editor rewrites this
 * row in place via cursor moves and erase-in-line — replaying those operations
 * against a cell array (instead of appending the redraw text verbatim) is what
 * turns repeated PSReadLine redraws back into a single overwritten line.
 */
class LineBuffer {
  private cells: Cell[] = [];
  private cursor = 0;

  write(char: string, style: string | null): void {
    while (this.cells.length < this.cursor) this.cells.push({ char: ' ', style: null });
    this.cells[this.cursor] = { char, style };
    this.cursor++;
  }

  carriageReturn(): void {
    this.cursor = 0;
  }

  backspace(): void {
    if (this.cursor > 0) this.cursor--;
  }

  moveTo(col: number): void {
    this.cursor = Math.max(0, col);
  }

  moveBy(delta: number): void {
    this.cursor = Math.max(0, this.cursor + delta);
  }

  eraseToEnd(): void {
    this.cells.length = Math.min(this.cells.length, this.cursor);
  }

  eraseToStart(): void {
    for (let i = 0; i < this.cursor && i < this.cells.length; i++) this.cells[i] = { char: ' ', style: null };
  }

  eraseAll(): void {
    this.cells = [];
    this.cursor = 0;
  }

  cursorPosition(): number {
    return this.cursor;
  }

  /**
   * Renders the line, splicing in the cursor caret at `cursorIndex` (between
   * cells, not overlaying one) when given. A run is cut short right before
   * that index so the caret lands between two distinct style spans.
   */
  toHtml(cursorIndex: number | null = null): string {
    let html = '';
    let cursorEmitted = cursorIndex === null;
    let i = 0;

    const emitCursorIfDue = () => {
      if (!cursorEmitted && i === cursorIndex) {
        html += CURSOR_HTML;
        cursorEmitted = true;
      }
    };

    while (i < this.cells.length) {
      emitCursorIfDue();
      const { style } = this.cells[i];
      let run = '';
      while (i < this.cells.length && this.cells[i].style === style && (cursorEmitted || i !== cursorIndex)) {
        run += this.cells[i].char;
        i++;
      }
      const escaped = escapeHtml(run);
      html += style ? `<span style="${style}">${escaped}</span>` : escaped;
    }
    emitCursorIfDue();

    return html;
  }
}

/** A bare `\x1b[...m` resets to the default style; otherwise the mapped codes replace it. */
function applySgr(codes: number[], current: string | null): string | null {
  if (codes.length === 0 || codes.includes(0)) return null;
  const styles = codes.map((code) => SGR_MAP[code]).filter((style): style is string => Boolean(style));
  return styles.length ? styles.join('; ') : current;
}

/**
 * Converts a raw PTY stream into HTML lines, emulating just enough of a
 * terminal — cursor moves, erase-in-line, SGR colors — to render shell
 * line-editor redraws as a single overwritten line rather than literal
 * escape-sequence text or duplicated fragments.
 */
export function ansiToHtml(raw: string, showCursor = false): string {
  const lines: string[] = [];
  let line = new LineBuffer();
  let style: string | null = null;

  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(raw)) !== null) {
    const groups = match.groups ?? {};

    if (groups.text !== undefined) {
      for (const char of groups.text) {
        switch (char) {
          case '\n':
            lines.push(line.toHtml());
            line = new LineBuffer();
            break;
          case '\r':
            line.carriageReturn();
            break;
          case '\x08':
            line.backspace();
            break;
          case '\x07':
            break;
          default:
            line.write(char, style);
        }
      }
      continue;
    }

    if (groups.final === undefined) continue; // OSC / charset / single-char escapes — not rendered

    const params = (groups.params ?? '').replace(/\?/g, '');
    const codes = params.length ? params.split(';').filter(Boolean).map(Number) : [];

    switch (groups.final) {
      case 'm':
        style = applySgr(codes, style);
        break;
      case 'K': {
        const mode = codes[0] ?? 0;
        if (mode === 1) line.eraseToStart();
        else if (mode === 2) line.eraseAll();
        else line.eraseToEnd();
        break;
      }
      case 'G':
        line.moveTo((codes[0] ?? 1) - 1);
        break;
      case 'H':
      case 'f':
        line.moveTo((codes[1] ?? 1) - 1);
        break;
      case 'C':
        line.moveBy(codes[0] ?? 1);
        break;
      case 'D':
        line.moveBy(-(codes[0] ?? 1));
        break;
      default:
        // Cursor visibility, scroll regions, mode toggles, line/row moves, etc. — not rendered.
        break;
    }
  }

  // The caret only ever sits on the line currently being edited — the last
  // one in the stream — never on completed scrollback lines above it.
  lines.push(line.toHtml(showCursor ? line.cursorPosition() : null));
  return lines.join('\n');
}

const CLEAR_SCREEN_PATTERN = /\x1b\[[23]J|\x1b\[H|\x1bc/g;

/**
 * Detects screen-clear sequences (emitted by `cls`/`Clear-Host`/`clear`).
 * The renderer is an append-only scrollback buffer rather than a full
 * screen emulator, so a clear sequence means "wipe the buffer" — anything
 * before the last clear marker is discarded, the remainder kept.
 */
export function extractClearScreen(chunk: string): { cleared: boolean; remainder: string } {
  let cleared = false;
  let remainder = chunk;
  let match: RegExpExecArray | null;

  CLEAR_SCREEN_PATTERN.lastIndex = 0;
  while ((match = CLEAR_SCREEN_PATTERN.exec(chunk)) !== null) {
    cleared = true;
    remainder = chunk.slice(match.index + match[0].length);
  }

  return { cleared, remainder };
}
