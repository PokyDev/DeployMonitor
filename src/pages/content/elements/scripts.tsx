import { useEffect, useRef } from 'react';
import { Plus, FileCode, Edit3, Trash2, Save, Zap, Activity, X } from 'lucide-react';
import type { useMockScripts, ScriptDef } from '../../../hooks/use-mock-scripts';
import './scripts.css';

type Scripts = ReturnType<typeof useMockScripts>;

const LANG_PILL: Record<ScriptDef['lang'], string> = {
  bash: 'bash',
  python: 'python',
  node: 'node',
};

type Token = { text: string; cls?: 'kw' | 'str' | 'cmt' | 'var' };

const TOKEN_RE =
  /(#![^\n]*)|(#[^\n]*|\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|echo|export|local|read|exit|cd|set|source|sudo|systemctl|import|from|def|class|print|await|async|const|let|for await|of|console|require)\b/g;

function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line))) {
    if (match.index > last) out.push({ text: line.slice(last, match.index) });
    const [full, shebang, comment, str, variable, keyword] = match;
    if (shebang) out.push({ text: shebang, cls: 'kw' });
    else if (comment) out.push({ text: comment, cls: 'cmt' });
    else if (str) out.push({ text: str, cls: 'str' });
    else if (variable) out.push({ text: variable, cls: 'var' });
    else if (keyword) out.push({ text: keyword, cls: 'kw' });
    last = match.index + full.length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

function CodeLine({ text }: { text: string }) {
  const tokens = tokenizeLine(text);
  return (
    <div className="scripts-code__line">
      {text === '' ? ' ' : tokens.map((tok, i) => (
        tok.cls ? <span key={i} className={`scripts-tok scripts-tok--${tok.cls}`}>{tok.text}</span> : <span key={i}>{tok.text}</span>
      ))}
    </div>
  );
}

function ScriptListItem({ script, active, onSelect }: { script: ScriptDef; active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`scripts-item${active ? ' scripts-item--active' : ''}`}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      <div className="scripts-item__top">
        <FileCode size={15} strokeWidth={1.5} className="scripts-item__icon" aria-hidden="true" />
        <span className="scripts-item__name">{script.name}</span>
        <span className="dm-badge dm-badge--idle scripts-item__pill">{LANG_PILL[script.lang]}</span>
      </div>
      <div className="scripts-item__path">{script.path}</div>
      <div className="scripts-item__actions">
        <span className="scripts-icon-btn" role="button" tabIndex={-1} title="Editar" aria-label="Editar script">
          <Edit3 size={13} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="scripts-icon-btn" role="button" tabIndex={-1} title="Eliminar" aria-label="Eliminar script">
          <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

type ScriptsProps = {
  scripts: Scripts;
};

export default function Scripts({ scripts }: ScriptsProps) {
  const { scripts: list, selected, select, execution, run, reset } = scripts;
  const codeLines = selected.source.split('\n');
  const isRunning = execution?.scriptId === selected.id && execution.status === 'running';
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [execution?.lines]);

  const handleSelect = (id: string) => {
    select(id);
    if (execution && execution.scriptId !== id) reset();
  };

  return (
    <div className="dashboard__content-inner dm-section scripts-section">
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Scripts</div>
          <div className="dm-section-desc">{list.length} scripts disponibles para ejecución remota</div>
        </div>
      </div>

      <div className="scripts-wrap">
        <div className="scripts-list">
          <button type="button" className="dm-btn scripts-list__new">
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nuevo script
          </button>
          <div className="scripts-list__inner">
            {list.map((script) => (
              <ScriptListItem
                key={script.id}
                script={script}
                active={script.id === selected.id}
                onSelect={() => handleSelect(script.id)}
              />
            ))}
          </div>
        </div>

        <div className="scripts-editor">
          <div className="scripts-editor__tabs">
            <div className="scripts-editor__tab scripts-editor__tab--active">
              <FileCode size={14} strokeWidth={1.5} className="scripts-editor__tab-icon" aria-hidden="true" />
              {selected.name}
            </div>
          </div>
          <div className="scripts-editor__body">
            <div className="scripts-gutter" aria-hidden="true">
              {codeLines.map((_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <div className="scripts-code">
              {codeLines.map((line, i) => <CodeLine key={i} text={line} />)}
            </div>
          </div>
          <div className="scripts-editor__actions">
            <span className="scripts-editor__spacer" />
            <button type="button" className="dm-btn dm-btn--sm">
              <Save size={14} strokeWidth={1.5} aria-hidden="true" />
              Guardar
            </button>
            {isRunning && (
              <button type="button" className="dm-btn dm-btn--sm dm-btn--danger" onClick={reset}>
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
                Cancelar
              </button>
            )}
            <button
              type="button"
              className={`dm-btn dm-btn--sm dm-btn--primary${isRunning ? ' scripts-run-btn--active' : ''}`}
              onClick={() => run(selected.id)}
              disabled={isRunning}
            >
              {isRunning
                ? <Activity size={14} strokeWidth={1.5} className="scripts-spin" aria-hidden="true" />
                : <Zap size={14} strokeWidth={1.5} aria-hidden="true" />}
              {isRunning ? 'Ejecutando…' : 'Ejecutar'}
            </button>
          </div>

          {execution?.scriptId === selected.id && (
            <div className="scripts-output" ref={outputRef} role="log" aria-live="polite">
              {execution.lines.map((line, i) => (
                <div key={i} className="scripts-output__line">{line}</div>
              ))}
              {execution.status === 'success' && (
                <div className="scripts-output__line scripts-output__line--ok">✔ Ejecución finalizada (código 0)</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
