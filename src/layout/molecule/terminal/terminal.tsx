import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { Terminal as TerminalIcon, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { ansiToHtml } from '../../../lib/ansi-to-html';
import { keyToEscapeSequence } from '../../../lib/terminal-keymap';
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

/** How long the caret stays solid after the last keystroke before it resumes blinking. */
const CURSOR_IDLE_MS = 500;

function getSelectedText(): string {
  return window.getSelection()?.toString() ?? '';
}

export default function Terminal({ expanded, onToggleExpanded }: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Solid the moment the terminal gains focus or the user types/navigates —
  // immediate confirmation of where the focus landed — then blinking once
  // idle, same convention as a text-editor caret.
  const [cursorSolid, setCursorSolid] = useState(false);
  const cursorIdleTimer = useRef<number | null>(null);

  const outputChunks = useTerminalStore((s) => s.outputChunks);
  const isRunning = useTerminalStore((s) => s.isRunning);

  const html = useMemo(() => ansiToHtml(outputChunks.join(''), isRunning), [outputChunks, isRunning]);

  const markCursorActive = () => {
    setCursorSolid(true);
    if (cursorIdleTimer.current !== null) window.clearTimeout(cursorIdleTimer.current);
    cursorIdleTimer.current = window.setTimeout(() => setCursorSolid(false), CURSOR_IDLE_MS);
  };

  useEffect(() => {
    return () => {
      if (cursorIdleTimer.current !== null) window.clearTimeout(cursorIdleTimer.current);
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

  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [html, expanded]);

  useEffect(() => {
    if (expanded) scrollRef.current?.focus();
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

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const isCopyShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c';
    if (isCopyShortcut) {
      const selected = getSelectedText();
      if (selected) {
        e.preventDefault();
        copySelection(selected);
        return;
      }
    }

    e.preventDefault();
    const seq = keyToEscapeSequence(e);
    if (seq) {
      markCursorActive();
      void useTerminalStore.getState().write(seq);
    }
  };

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const selected = getSelectedText();
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
            onClick={(e) => { e.stopPropagation(); void useTerminalStore.getState().clearViaCls(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                void useTerminalStore.getState().clearViaCls();
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
        <div
          ref={scrollRef}
          className={`terminal__scroll${cursorSolid ? ' terminal__scroll--cursor-solid' : ''}`}
          tabIndex={0}
          role="textbox"
          aria-label="Terminal local"
          aria-multiline="true"
          onKeyDown={handleKeyDown}
          onFocus={markCursorActive}
          onClick={() => scrollRef.current?.focus()}
          onContextMenu={handleContextMenu}
        >
          <pre className="terminal__output" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
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
