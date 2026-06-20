import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Plus,
  FileCode,
  FilePlus2,
  FolderOpen,
  Save,
  Zap,
  RefreshCw,
  ArrowLeft,
  MousePointerSquareDashed,
  MousePointerClick,
  MousePointer2,
  MouseRight,
} from 'lucide-react';
import type { useScriptFiles, ScriptFileEntry } from '../../../hooks/use-script-files';
import './scripts.css';

type Scripts = ReturnType<typeof useScriptFiles>;

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
      {text === '' ? ' ' : tokens.map((tok, i) => (
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

/** Editable code surface: the highlighted `CodeBlock` is the visual layer,
 * a transparent `<textarea>` on top is the real (and only) scrollable
 * element, so it owns native undo/redo, selection and IME for free. The
 * textarea's onScroll copies scrollTop/scrollLeft onto the highlight layer
 * to keep both perfectly in sync ("textarea over pre" technique). */
function CodeEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const lines = value.split('\n');

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (!highlightRef.current) return;
    highlightRef.current.scrollTop = e.currentTarget.scrollTop;
    highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  return (
    <div className="scripts-editbox">
      <div className="scripts-editbox__view" ref={highlightRef} aria-hidden="true">
        <CodeBlock lines={lines} />
      </div>
      <textarea
        className="scripts-editbox__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        aria-label="Contenido del script"
      />
    </div>
  );
}

function ScriptListItem({ script, active, onPreview, onOpen }: { script: ScriptFileEntry; active: boolean; onPreview: () => void; onOpen: () => void }) {
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

/** Inline "new file" card rendered above the list while creating. Confirms
 * on blur/Enter with a non-empty name, cancels on blur/Enter when empty. */
function NewFileCard({ error, onConfirm, onCancel }: { error: string | null; onConfirm: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    if (value.trim()) onConfirm(value);
    else onCancel();
  };

  return (
    <div className="scripts-item scripts-item--creating" onClick={(e) => e.stopPropagation()}>
      <div className="scripts-item__top">
        <FileCode size={15} strokeWidth={1.5} className="scripts-item__icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="scripts-item__name-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="nombre-del-script.sh"
          spellCheck={false}
        />
      </div>
      {error && <div className="scripts-item__error">{error}</div>}
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
  disabled?: boolean;
};

function EditorToolbarButton({ icon: Icon, label, onClick, active, pulse, pressed, disabled }: EditorToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className={`scripts-toolbar-btn${active ? ' scripts-toolbar-btn--active' : ''}${pulse ? ' scripts-run-btn--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
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

/** Opens the native directory picker. Returns null if the user cancels. */
async function pickScriptDirectory(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  if (typeof result === 'string') return result;
  return null;
}

function contentStatusLines(loading: boolean, error: string | null): string[] | null {
  if (loading) return ['Cargando…'];
  if (error) return [error];
  return null;
}

type ScriptsProps = {
  scripts: Scripts;
};

export default function Scripts({ scripts }: ScriptsProps) {
  const {
    directoryPath,
    setDirectoryPath,
    files,
    filesLoading,
    filesError,
    selected,
    selectFile,
    content,
    contentLoading,
    contentError,
    setContent,
    dirty,
    autosave,
    setAutosave,
    save,
    creating,
    createError,
    startCreate,
    confirmCreate,
    cancelCreate,
  } = scripts;

  const [showEditor, setShowEditor] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);

  const handlePreview = (path: string) => {
    selectFile(path);
    setHasPreview(true);
  };

  const handleOpen = (path: string) => {
    handlePreview(path);
    setShowEditor(true);
  };

  const handleBack = () => setShowEditor(false);

  const handleDeselect = () => setHasPreview(false);

  const handlePickDirectory = async () => {
    const dir = await pickScriptDirectory();
    if (dir) setDirectoryPath(dir);
  };

  const statusLines = contentStatusLines(contentLoading, contentError);
  const subtitle = !directoryPath
    ? 'Selecciona un directorio para ver tus scripts'
    : filesLoading
      ? 'Cargando archivos…'
      : filesError
        ? filesError
        : `${files.length} archivo(s) en el directorio`;

  return (
    <div className={`dashboard__content-inner dm-section scripts-section${showEditor ? ' scripts-section--detail' : ''}`}>
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Scripts</div>
          <div className="dm-section-desc">{subtitle}</div>
        </div>
        <div className="dm-input-row scripts-dir-field">
          <input
            className="dm-input dm-input--readonly"
            value={directoryPath}
            readOnly
            placeholder="Ningún directorio seleccionado"
            spellCheck={false}
          />
          <button type="button" className="dm-btn" onClick={handlePickDirectory}>
            <FolderOpen size={15} strokeWidth={1.5} aria-hidden="true" />
            Elegir carpeta
          </button>
        </div>
      </div>

      <div className="scripts-wrap">
        <div className={`scripts-list${hasPreview ? '' : ' scripts-list--no-preview'}`} onClick={handleDeselect}>
          <button type="button" className="dm-btn scripts-list__new" onClick={(e) => { e.stopPropagation(); startCreate(); }} disabled={!directoryPath}>
            <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
            Nuevo script
          </button>
          <div className="scripts-list__inner">
            {creating && (
              <NewFileCard
                error={createError}
                onConfirm={(name) => void confirmCreate(name)}
                onCancel={cancelCreate}
              />
            )}
            {files.map((script) => (
              <ScriptListItem
                key={script.path}
                script={script}
                active={script.path === selected?.path}
                onPreview={() => handlePreview(script.path)}
                onOpen={() => handleOpen(script.path)}
              />
            ))}
          </div>
        </div>

        <div className={`scripts-preview${hasPreview ? '' : ' scripts-preview--empty'}`}>
          {hasPreview && selected ? (
            <>
              <div className="scripts-preview__header">
                <FileCode size={14} strokeWidth={1.5} className="scripts-editor__tab-icon" aria-hidden="true" />
                {selected.name}
              </div>
              <div className="scripts-preview__body">
                <CodeBlock lines={statusLines ?? content.split('\n')} />
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
                {selected?.name}
              </div>
            </div>
            <div className="scripts-toolbar">
              <EditorToolbarButton
                icon={RefreshCw}
                label={autosave ? 'Autoguardado activado' : 'Activar autoguardado'}
                active={autosave}
                pressed={autosave}
                onClick={() => setAutosave(!autosave)}
              />
              <EditorToolbarButton
                icon={Save}
                label="Guardar"
                onClick={() => void save()}
                disabled={!selected || !dirty}
              />
              <EditorToolbarButton
                icon={Zap}
                label="Ejecutar script (próximamente)"
                disabled
              />
            </div>
          </div>
          <div className="scripts-editor__body">
            {statusLines ? (
              <CodeBlock lines={statusLines} />
            ) : (
              <CodeEditor value={content} onChange={setContent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
