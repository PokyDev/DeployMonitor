import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { buildTheme } from '../../../lib/terminal-theme';

type HistoryLogTerminalProps = {
  output: string;
};

/** Read-only xterm.js viewer for a stored run-history log — its own
 * `Terminal` instance, not the interactive one (see `spec-terminal.md` §
 * "each read-only script-output viewer all get their own instance"). Renders
 * through the real VT100/SGR parser so any ANSI colors the script printed
 * during the run (captured raw in `runRemoteScript`, `use-terminal-store.ts`)
 * show up exactly as they did live, instead of the heuristic line-by-line
 * classifying this replaces. */
export default function HistoryLogTerminal({ output }: HistoryLogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.6,
      scrollback: 5000,
      disableStdin: true,
      cursorBlink: false,
      convertEol: true,
      theme: buildTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    termRef.current = term;

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Re-renders in place (no new instance) when the open entry changes — the
  // detail sidebar stays mounted across entry switches (see `DetailSidebar`
  // in history.tsx), so reusing the terminal avoids tearing down/recreating
  // its DOM and canvas layers on every card click.
  useEffect(() => {
    termRef.current?.reset();
    termRef.current?.write(output);
  }, [output]);

  return <div ref={containerRef} className="history-log-term__xterm" />;
}
