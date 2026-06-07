import { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import type { TerminalLine } from '../../../hooks/use-mock-terminal';
import './terminal.css';

type TerminalProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  lines: TerminalLine[];
  onClear: () => void;
  onRunCommand: (command: string) => void;
  active: boolean;
};

export default function Terminal({ expanded, onToggleExpanded, lines, onClear, onRunCommand, active }: TerminalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines, expanded]);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const submit = () => {
    const command = draft.trim();
    if (!command) return;
    onRunCommand(command);
    setDraft('');
  };

  return (
    <div className={`terminal${expanded ? ' terminal--expanded' : ''}`}>
      <button
        type="button"
        className="terminal__head"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls="terminal-body"
      >
        <span className="terminal__head-left">
          <TerminalIcon size={15} strokeWidth={1.5} className="terminal__head-icon" aria-hidden="true" />
          <span className="terminal__head-title">Terminal</span>
          {active && <span className="terminal__badge">Activo</span>}
        </span>
        <span className="terminal__head-right">
          <span
            role="button"
            tabIndex={0}
            className="terminal-icon-btn"
            title="Limpiar"
            aria-label="Limpiar terminal"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onClear(); } }}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="terminal-icon-btn" aria-hidden="true">
            {expanded ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronUp size={16} strokeWidth={1.5} />}
          </span>
        </span>
      </button>

      <div className="terminal__body" id="terminal-body">
        <div className="terminal__scroll" ref={bodyRef}>
          {lines.map((line, i) => (
            <div key={line.id} className="terminal__line" style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}>
              {line.text}
            </div>
          ))}
        </div>
        <form
          className="terminal__input-row"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <span className="terminal__prompt" aria-hidden="true">$</span>
          <input
            ref={inputRef}
            type="text"
            className="terminal__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe un comando…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Comando de terminal"
          />
        </form>
      </div>
    </div>
  );
}
