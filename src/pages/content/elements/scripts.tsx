import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Plus,
  FileCode,
  FilePlus2,
  Save,
  Zap,
  X,
  RefreshCw,
  ArrowLeft,
  MousePointerSquareDashed,
  MousePointerClick,
  MousePointer2,
  MouseRight,
} from 'lucide-react';
import type { useMockScripts, ScriptDef } from '../../../hooks/use-mock-scripts';
import './scripts.css';

type Scripts = ReturnType<typeof useMockScripts>;

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

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <>
      <div className="scripts-gutter" aria-hidden="true">
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="scripts-code">
        {lines.map((line, i) => <CodeLine key={i} text={line} />)}
      </div>
    </>
  );
}

function ScriptListItem({ script, active, onPreview, onOpen }: { script: ScriptDef; active: boolean; onPreview: () => void; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`scripts-item${active ? ' scripts-item--active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onPreview(); }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); }}
    >
      <div className="scripts-item__top">
        <FileCode size={15} strokeWidth={1.5} className="scripts-item__icon" aria-hidden="true" />
        <span className="scripts-item__name">{script.name}</span>
      </div>
      <div className="scripts-item__path">{script.path}</div>
    </div>
  );
}

type EditorToolbarButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  pulse?: boolean;
  pressed?: boolean;
};

function EditorToolbarButton({ icon: Icon, label, onClick, active, pulse, pressed }: EditorToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className={`scripts-toolbar-btn${active ? ' scripts-toolbar-btn--active' : ''}${pulse ? ' scripts-run-btn--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
      {hover && <span className="scripts-toolbar-btn__tooltip" role="tooltip">{label}</span>}
    </button>
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
  const [showEditor, setShowEditor] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [autosave, setAutosave] = useState(false);

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [execution?.lines]);

  const handlePreview = (id: string) => {
    select(id);
    if (execution && execution.scriptId !== id) reset();
    setHasPreview(true);
  };

  const handleOpen = (id: string) => {
    handlePreview(id);
    setShowEditor(true);
  };

  const handleBack = () => setShowEditor(false);

  const handleDeselect = () => setHasPreview(false);

  return (
    <div className={`dashboard__content-inner dm-section scripts-section${showEditor ? ' scripts-section--detail' : ''}`}>
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Scripts</div>
          <div className="dm-section-desc">{list.length} scripts disponibles para ejecución remota</div>
        </div>
      </div>

      <div className="scripts-wrap">
        <div className={`scripts-list${hasPreview ? '' : ' scripts-list--no-preview'}`} onClick={handleDeselect}>
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
                onPreview={() => handlePreview(script.id)}
                onOpen={() => handleOpen(script.id)}
              />
            ))}
          </div>
        </div>

        <div className={`scripts-preview${hasPreview ? '' : ' scripts-preview--empty'}`}>
          {hasPreview ? (
            <>
              <div className="scripts-preview__header">
                <FileCode size={14} strokeWidth={1.5} className="scripts-editor__tab-icon" aria-hidden="true" />
                {selected.name}
              </div>
              <div className="scripts-preview__body">
                <CodeBlock lines={codeLines} />
              </div>
              <div className="scripts-preview__hint">Doble click para abrir</div>
            </>
          ) : (
            <div className="scripts-preview__empty">
              <div className="scripts-preview__empty-icon">
                <MousePointerSquareDashed size={20} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="scripts-preview__empty-title">Explora tus scripts</p>
              <p className="scripts-preview__empty-sub">Esto es lo que puedes hacer con tus archivos:</p>
              <ul className="scripts-preview__guide">
                <li className="scripts-preview__guide-item scripts-preview__guide-item--create">
                  <span className="scripts-preview__guide-icon">
                    <FilePlus2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="scripts-preview__guide-text">
                    <strong>Crear</strong>
                    <span>Define el nombre y formato de tu nuevo script.</span>
                  </span>
                </li>
                <li className="scripts-preview__guide-item scripts-preview__guide-item--preview">
                  <span className="scripts-preview__guide-icon">
                    <MousePointerClick size={14} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="scripts-preview__guide-text">
                    <strong>Previsualizar</strong>
                    <span>Un click selecciona el archivo y muestra su contenido aquí.</span>
                  </span>
                </li>
                <li className="scripts-preview__guide-item scripts-preview__guide-item--open">
                  <span className="scripts-preview__guide-icon">
                    <MousePointer2 size={14} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="scripts-preview__guide-text">
                    <strong>Editar y ejecutar</strong>
                    <span>Doble click abre el editor completo del script.</span>
                  </span>
                </li>
                <li className="scripts-preview__guide-item scripts-preview__guide-item--delete">
                  <span className="scripts-preview__guide-icon">
                    <MouseRight size={14} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="scripts-preview__guide-text">
                    <strong>Eliminar</strong>
                    <span>Click derecho sobre un script y selecciona "Eliminar".</span>
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="scripts-editor">
          <div className="scripts-editor__tabs">
            <div className="scripts-editor__tabs-left">
              <button type="button" className="scripts-editor__back" onClick={handleBack}>
                <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
                Volver
              </button>
              <div className="scripts-editor__tab scripts-editor__tab--active">
                <FileCode size={14} strokeWidth={1.5} className="scripts-editor__tab-icon" aria-hidden="true" />
                {selected.name}
              </div>
            </div>
            <div className="scripts-toolbar">
              <EditorToolbarButton
                icon={RefreshCw}
                label={autosave ? 'Autoguardado activado' : 'Activar autoguardado'}
                active={autosave}
                pressed={autosave}
                onClick={() => setAutosave((v) => !v)}
              />
              <EditorToolbarButton icon={Save} label="Guardar" />
              <EditorToolbarButton
                icon={isRunning ? X : Zap}
                label={isRunning ? 'Cancelar ejecución' : 'Ejecutar script'}
                active={isRunning}
                pulse={isRunning}
                onClick={() => (isRunning ? reset() : run(selected.id))}
              />
            </div>
          </div>
          <div className="scripts-editor__body">
            <CodeBlock lines={codeLines} />
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
