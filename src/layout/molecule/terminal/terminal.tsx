import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Terminal as TerminalIcon, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { buildTheme } from '../../../lib/terminal-theme';
import { buildWelcomeLine1, buildWelcomeLine2, interpolateOpacity } from '../../../lib/terminal-welcome';
import { useTerminalStore } from '../../../stores/use-terminal-store';
import './terminal.css';

type TerminalProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  text: string;
};

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 160;
const MAX_HEIGHT_RATIO = 0.7;
const WELCOME_PULSE_PERIOD_MS = 4000;
const WELCOME_PULSE_INTERVAL_MS = 50;
// Floor for the line-2 pulse so the text never fades to fully invisible.
const WELCOME_PULSE_MIN_OPACITY = 0.35;

export default function Terminal({ expanded, onToggleExpanded }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const welcomePulseRef = useRef<number | null>(null);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const isRunning = useTerminalStore((s) => s.isRunning);

  // Create the xterm.js instance once and attach it to the container.
  // term.onData() owns input, term.write() (driven by the store's pty:data
  // listener) owns output — no manual keydown map or ANSI-to-HTML conversion.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const startLocked = useTerminalStore.getState().locked;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.55,
      scrollback: 5000,
      cursorBlink: !startLocked,
      theme: buildTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    useTerminalStore.getState().setTerminal(term);

    // Lock screen: hide all real shell output behind a welcome message until
    // the user presses any key. pty:data is buffered by the store meanwhile.
    if (startLocked) {
      // \x1b[?25l hides the cursor (DECTCEM) — re-shown with \x1b[?25h on unlock.
      term.write(`\x1b[?25l\x1b[2J\x1b[H${buildWelcomeLine1()}\r\n${buildWelcomeLine2(interpolateOpacity(1))}`);

      const start = performance.now();
      welcomePulseRef.current = window.setInterval(() => {
        const elapsed = performance.now() - start;
        const raw = (Math.sin((elapsed / WELCOME_PULSE_PERIOD_MS) * 2 * Math.PI) + 1) / 2;
        const t = WELCOME_PULSE_MIN_OPACITY + raw * (1 - WELCOME_PULSE_MIN_OPACITY);
        term.write(buildWelcomeLine2(interpolateOpacity(t)));
      }, WELCOME_PULSE_INTERVAL_MS);
    }

    term.onData((data) => {
      if (useTerminalStore.getState().locked) {
        if (welcomePulseRef.current !== null) {
          window.clearInterval(welcomePulseRef.current);
          welcomePulseRef.current = null;
        }
        term.write(`${buildWelcomeLine2(interpolateOpacity(1))}\r\n\r\n\x1b[?25h`);
        term.options.cursorBlink = true;
        useTerminalStore.getState().unlock();
        return;
      }
      void useTerminalStore.getState().write(data);
    });

    // Ctrl/Cmd+C copies the selection instead of sending SIGINT, mirroring
    // the previous custom copy shortcut. With no selection, fall through so
    // xterm sends \x03 as usual.
    term.attachCustomKeyEventHandler((e) => {
      const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
      if (isCopyShortcut && e.type === 'keydown') {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard.writeText(selection);
          return false;
        }
      }
      return true;
    });

    return () => {
      if (welcomePulseRef.current !== null) {
        window.clearInterval(welcomePulseRef.current);
        welcomePulseRef.current = null;
      }
      useTerminalStore.getState().setTerminal(null);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Register the pty:data listener once (guarded module-level inside the store).
  useEffect(() => {
    void useTerminalStore.getState().init();
  }, []);

  // Start the local shell as soon as the dashboard mounts — not when the
  // panel is first expanded — so a session is already live (and able to
  // receive injected setup output) by the time the user opens it.
  useEffect(() => {
    void useTerminalStore.getState().start(DEFAULT_COLS, DEFAULT_ROWS);
  }, []);

  // Kill the shell process when the terminal leaves the tree (e.g. on logout).
  useEffect(() => {
    return () => {
      void useTerminalStore.getState().stop();
    };
  }, []);

  // Keep the PTY size in sync with the container's rendered size — covers the
  // expand/collapse toggle, the drag-resize handle, and window resizes.
  // fit() on a zero-size container (collapsed panel) yields 1x1; it is
  // re-run by this observer once the container gets real dimensions.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const fitAddon = fitAddonRef.current;
      const term = termRef.current;
      if (!fitAddon || !term) return;
      fitAddon.fit();
      void useTerminalStore.getState().resize(term.cols, term.rows);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (expanded) termRef.current?.focus();
  }, [expanded]);

  // Drag-resize: track the gesture on window-level listeners so the cursor
  // can leave the handle without interrupting the resize.
  const handleResizeStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    const maxHeight = Math.round(window.innerHeight * MAX_HEIGHT_RATIO);

    setIsResizing(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const next = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeight + delta));
      setHeight(next);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Close the context menu on any outside interaction or Escape.
  useEffect(() => {
    if (!contextMenu) return;

    const closeUnlessInsideMenu = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };

    window.addEventListener('mousedown', closeUnlessInsideMenu);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeUnlessInsideMenu);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [contextMenu]);

  const copySelection = (text: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
  };

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const selected = termRef.current?.getSelection() ?? '';
    if (!selected) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, text: selected });
  };

  return (
    <div
      className={`terminal${expanded ? ' terminal--expanded' : ''}${isResizing ? ' terminal--resizing' : ''}`}
      style={expanded ? { height } : undefined}
    >
      {expanded && (
        <div
          className="terminal__resize-handle"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Redimensionar terminal"
        />
      )}
      <div className="terminal__head">
        <span className="terminal__head-left">
          <TerminalIcon size={15} strokeWidth={1.5} className="terminal__head-icon" aria-hidden="true" />
          <span className="terminal__head-title">Terminal</span>
          {isRunning && <span className="terminal__badge">Activo</span>}
        </span>
        <span className="terminal__head-right">
          <span
            role="button"
            tabIndex={0}
            className="terminal-icon-btn"
            title="Limpiar"
            aria-label="Limpiar terminal"
            onClick={(e) => { e.stopPropagation(); useTerminalStore.getState().clear(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                useTerminalStore.getState().clear();
              }
            }}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="terminal-icon-btn"
            title={expanded ? 'Minimizar' : 'Expandir'}
            aria-label={expanded ? 'Minimizar terminal' : 'Expandir terminal'}
            aria-expanded={expanded}
            aria-controls="terminal-body"
            onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onToggleExpanded();
              }
            }}
          >
            {expanded ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronUp size={16} strokeWidth={1.5} />}
          </span>
        </span>
      </div>

      <div className="terminal__body" id="terminal-body">
        <div ref={containerRef} className="terminal__xterm" onContextMenu={handleContextMenu} />
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="terminal__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            className="terminal__context-menu-item"
            onClick={() => {
              copySelection(contextMenu.text);
              setContextMenu(null);
            }}
          >
            <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
            Copiar
          </button>
        </div>
      )}
    </div>
  );
}
