import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Terminal as TerminalIcon, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { buildTheme } from '../../../lib/terminal-theme';
import {
  APP_VERSION,
  TLS_DEPLOY,
  TLS_MONITOR,
  buildUnlockOutputLine,
  buildUnlockPrompt,
  UNLOCK_COMMAND,
} from '../../../lib/terminal-welcome';
import { SSH_CMD_RE } from '../../../lib/ssh-utils';
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
// Unlock animation: delay between each "typed" character of UNLOCK_COMMAND,
// and the pause before/after it (before typing starts, and before the
// output line appears).
const UNLOCK_TYPE_INTERVAL_MS = 70;
const UNLOCK_PAUSE_MS = 350;
// Extra grace period after the animation finishes before input is accepted.
const UNLOCK_FINAL_DELAY_MS = 500;
// Real command sent to the shell (not cosmetic) to leave the terminal clean
// after the unlock animation — typed out the same way as UNLOCK_COMMAND.
const CLS_COMMAND = 'cls';
// How long to wait for the shell's response to `cls` (clear-screen escape +
// redrawn prompt) before flushing it and unlocking.
const CLS_RESPONSE_DELAY_MS = 400;
// How long the HTML overlay's CSS fade-out takes before the xterm is revealed.
const LOCK_EXIT_DURATION_MS = 220;
// How long after the overlay appears before unlock inputs are accepted —
// prevents accidental triggers from the same click that expanded the panel.
const LOCK_INPUT_GRACE_MS = 500;

/**
 * Plays the fake "init" command + output, then redraws the real prompt so
 * the terminal looks ready for input. Purely cosmetic — term.write() only,
 * nothing is sent to the shell. `timeoutsRef` collects timeout ids so the
 * caller can cancel them on unmount.
 */
function runUnlockSequence(
  term: XTerm,
  promptText: string,
  timeoutsRef: { current: number[] },
  onDone: () => void,
) {
  let i = 0;
  const typeNextChar = () => {
    if (i < UNLOCK_COMMAND.length) {
      term.write(UNLOCK_COMMAND[i]);
      i += 1;
      timeoutsRef.current.push(window.setTimeout(typeNextChar, UNLOCK_TYPE_INTERVAL_MS));
      return;
    }
    timeoutsRef.current.push(
      window.setTimeout(() => {
        term.write(`\r\n${buildUnlockOutputLine()}\r\n\r\n${buildUnlockPrompt(promptText)}`, onDone);
      }, UNLOCK_PAUSE_MS),
    );
  };
  timeoutsRef.current.push(window.setTimeout(typeNextChar, UNLOCK_PAUSE_MS));
}

/**
 * Types out `CLS_COMMAND` on the current prompt line, then calls `onDone` —
 * which is responsible for actually sending it to the shell. Purely
 * cosmetic, like `runUnlockSequence`.
 */
function runClsTypingSequence(term: XTerm, timeoutsRef: { current: number[] }, onDone: () => void) {
  let i = 0;
  const typeNextChar = () => {
    if (i < CLS_COMMAND.length) {
      term.write(CLS_COMMAND[i]);
      i += 1;
      timeoutsRef.current.push(window.setTimeout(typeNextChar, UNLOCK_TYPE_INTERVAL_MS));
      return;
    }
    timeoutsRef.current.push(window.setTimeout(onDone, UNLOCK_PAUSE_MS));
  };
  timeoutsRef.current.push(window.setTimeout(typeNextChar, UNLOCK_PAUSE_MS));
}

/**
 * Drains `pendingOutput`, reveals the shell prompt on xterm, then runs the
 * cosmetic unlock animation followed by a real `cls` to leave the terminal
 * in a clean state. Called after the HTML overlay has finished fading out.
 */
function executeUnlockAnimation(
  term: XTerm,
  unlockTimeoutsRef: { current: number[] },
  onComplete: () => void,
) {
  const pending = useTerminalStore.getState().pendingOutput.join('');
  useTerminalStore.setState({ pendingOutput: [] });

  // Show cursor and write buffered PTY output (ends with the shell prompt).
  term.write(`\x1b[?25h${pending}`, () => {
    const buffer = term.buffer.active;
    const promptLine = buffer.getLine(buffer.baseY + buffer.cursorY);
    const promptText = promptLine?.translateToString(true) ?? '';

    runUnlockSequence(term, promptText, unlockTimeoutsRef, () => {
      // Flush anything the shell produced while the animation played.
      const late = useTerminalStore.getState().pendingOutput.join('');
      useTerminalStore.setState({ pendingOutput: [] });
      if (late) term.write(late);

      // Type out "cls" on the fresh prompt, then actually send it to the
      // shell so the terminal is genuinely clean.
      runClsTypingSequence(term, unlockTimeoutsRef, () => {
        void useTerminalStore.getState().write(`${CLS_COMMAND}\r`);

        unlockTimeoutsRef.current.push(
          window.setTimeout(() => {
            const cleared = useTerminalStore.getState().pendingOutput.join('');
            useTerminalStore.setState({ pendingOutput: [] });
            if (cleared) term.write(cleared);

            unlockTimeoutsRef.current.push(
              window.setTimeout(onComplete, UNLOCK_FINAL_DELAY_MS),
            );
          }, CLS_RESPONSE_DELAY_MS),
        );
      });
    });
  });
}

export default function Terminal({ expanded, onToggleExpanded }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unlockingRef = useRef(false);
  const unlockTimeoutsRef = useRef<number[]>([]);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [isLockExiting, setIsLockExiting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const isRunning = useTerminalStore((s) => s.isRunning);
  const locked = useTerminalStore((s) => s.locked);
  const scriptRunActive = useTerminalStore((s) => s.scriptRunActive);

  // Live clock for the lock screen.
  useEffect(() => {
    if (!locked) return;
    const iv = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(iv);
  }, [locked]);

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

    // While the HTML lock screen overlay is visible, disable stdin so no
    // keystrokes reach onData or the PTY. Cursor is hidden for cleanliness.
    if (startLocked) {
      term.options.disableStdin = true;
      term.write('\x1b[?25l');
    }

    // After the overlay fades out, all lock-screen logic runs here, not in
    // onData — so onData only ever writes user input to the PTY.
    //
    // We also maintain a lightweight input buffer to detect:
    //   1. SSH commands typed manually → notifies the connection hook
    //   2. "exit" typed while SSH is active → notifies the connection hook
    let inputBuffer = '';
    term.onData((data) => {
      // Detect Enter in all forms xterm.js may send (\r, \n, or \r\n as a single event).
      if (data === '\r' || data === '\n' || data === '\r\n') {
        if (inputBuffer.length > 0) {
          const trimmed = inputBuffer.trim();
          const store = useTerminalStore.getState();
          if (!store.sshConnected && SSH_CMD_RE.test(trimmed)) {
            store.notifySshCommandTyped(trimmed);
          } else if (store.sshConnected && trimmed === 'exit') {
            window.setTimeout(() => useTerminalStore.getState().sshExitCb?.(), 500);
          }
        }
        inputBuffer = '';
      } else if (data === '\x7f') {
        inputBuffer = inputBuffer.slice(0, -1);
      } else if (data === '\x03') {
        inputBuffer = '';
      } else if (data.length === 1 && data >= ' ') {
        inputBuffer += data;
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
      unlockTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      unlockTimeoutsRef.current = [];
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

  // Read-only while a script run's end marker is being watched for — same
  // disableStdin mechanism the lock screen already uses, so the user can't
  // type over the injected command or the marker use-script-runner.ts waits
  // for. Guarded by `locked` so it never fights the unlock animation's own
  // disableStdin toggling (the two states aren't expected to overlap).
  useEffect(() => {
    const term = termRef.current;
    if (!term || locked) return;
    term.options.disableStdin = scriptRunActive;
  }, [scriptRunActive, locked]);

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

  // Unlock trigger: any keydown while the lock screen is visible starts the
  // fade-out animation, then hands off to the unlock sequence.
  // The handleUnlock fn is also registered in the terminal store so the
  // "Conectar" button can trigger it programmatically.
  useEffect(() => {
    if (!locked || !expanded) {
      useTerminalStore.getState().registerUnlockFn(null);
      return;
    }

    const handleUnlock = () => {
      if (unlockingRef.current) return;
      unlockingRef.current = true;
      setIsLockExiting(true);

      unlockTimeoutsRef.current.push(
        window.setTimeout(() => {
          const term = termRef.current;
          if (!term) return;
          term.options.disableStdin = true;
          executeUnlockAnimation(term, unlockTimeoutsRef, () => {
            term.options.cursorBlink = true;
            term.options.disableStdin = false;
            useTerminalStore.getState().unlock();
            unlockingRef.current = false;
          });
        }, LOCK_EXIT_DURATION_MS),
      );
    };

    // Register for programmatic unlock (e.g. from the "Conectar" button).
    useTerminalStore.getState().registerUnlockFn(handleUnlock);

    const t = window.setTimeout(() => {
      window.addEventListener('keydown', handleUnlock);
    }, LOCK_INPUT_GRACE_MS);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', handleUnlock);
      useTerminalStore.getState().registerUnlockFn(null);
    };
  }, [locked, expanded]);

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

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

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

        {locked && expanded && (
          <div className={`terminal__lock${isLockExiting ? ' terminal__lock--exit' : ''}`}>
            <div className="terminal__lock-inner">
              <pre className="terminal__lock-ascii">{TLS_DEPLOY}</pre>
              <pre className="terminal__lock-ascii">{TLS_MONITOR}</pre>
              <div className="terminal__lock-meta">
                <span>v{APP_VERSION}</span>
                <span className="terminal__lock-dot"> · </span>
                <span>{dateStr}</span>
                <span className="terminal__lock-dot"> · </span>
                <span className="terminal__lock-clock">{timeStr}</span>
              </div>
              <div className="terminal__lock-hr" />
              <div className="terminal__lock-unlock">
                — Utiliza cualquier tecla para desbloquear —
              </div>
            </div>
          </div>
        )}
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
