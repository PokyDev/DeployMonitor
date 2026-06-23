import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  Trash2,
  Check,
  X,
  MousePointerSquareDashed,
  MousePointer2,
  MouseRight,
} from 'lucide-react';
import type { useScriptFiles, ScriptFileEntry } from '../../../hooks/use-script-files';
import { useScriptRemote, type ScriptActionStatus } from '../../../hooks/use-script-remote';
import type { useSshConnection } from '../../../hooks/use-ssh-connection';
import './scripts.css';

type Scripts = ReturnType<typeof useScriptFiles>;
type Connection = ReturnType<typeof useSshConnection>;

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

/** Double-click on the name swaps it for an inline input — same "commit on
 * blur/Enter, cancel on Escape/empty" idiom as `NewFileCard`'s input, just
 * editing an existing name instead of creating one. */
function ScriptListItem({
  script,
  active,
  renaming,
  renameError,
  onSelect,
  onContextMenu,
  onStartRename,
  onConfirmRename,
  onCancelRename,
  itemRef,
}: {
  script: ScriptFileEntry;
  active: boolean;
  renaming: boolean;
  renameError: string | null;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onStartRename: () => void;
  onConfirmRename: (newName: string) => void;
  onCancelRename: () => void;
  itemRef?: React.Ref<HTMLDivElement>;
}) {
  const [value, setValue] = useState(script.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setValue(script.name);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming, script.name]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== script.name) onConfirmRename(trimmed);
    else onCancelRename();
  };

  return (
    <div
      ref={itemRef}
      role="button"
      tabIndex={0}
      className={`scripts-item${active ? ' scripts-item--active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      <div className="scripts-item__top">
        <FileCode size={15} strokeWidth={1.5} className="scripts-item__icon" aria-hidden="true" />
        {renaming ? (
          <input
            ref={inputRef}
            className="scripts-item__name-input"
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
            }}
            spellCheck={false}
          />
        ) : (
          <span className="scripts-item__name">{script.name}</span>
        )}
      </div>
      <div className="scripts-item__path">{script.path}</div>
      {renaming && renameError && <div className="scripts-item__error">{renameError}</div>}
    </div>
  );
}

/** Inline confirmation rendered as the next sibling of the targeted file's
 * card inside `.scripts-list__inner` — its own box growing/shrinking (via the
 * `grid-template-rows` 0fr→1fr trick) is what pushes the items below it,
 * no measurement or animation of the parent list required. Mount/unmount is
 * gated by the *closing* CSS transition (`onTransitionEnd`), not by the
 * click handlers, so Cancel and the 10s auto-dismiss always animate out
 * before the card actually leaves the DOM. Confirm skips that — the whole
 * row (item + card) leaves together once the list refreshes, so animating
 * the card's own collapse first would just leave it orphaned for a beat. */
function DeleteConfirmCard({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Guards against a click and the 10s auto-dismiss firing back to back —
  // only the first one should actually run.
  const settle = (action: () => void) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setSettled(true);
    action();
  };

  const close = () => settle(() => setOpen(false));
  const handleConfirm = () => settle(onConfirm);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);

  return (
    <div
      className={`scripts-delete-confirm${open ? ' scripts-delete-confirm--open' : ''}`}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'grid-template-rows' && !open) onCancel();
      }}
    >
      <div className="scripts-delete-confirm__inner">
        <span className="scripts-delete-confirm__text scripts-delete-confirm__text--full">¿Deseas eliminar este archivo?</span>
        <span className="scripts-delete-confirm__text scripts-delete-confirm__text--short">¿Deseas eliminarlo?</span>
        <div className="scripts-delete-confirm__actions">
          <button
            type="button"
            className="dm-btn dm-btn--danger dm-btn--sm scripts-delete-confirm__btn"
            onClick={handleConfirm}
            disabled={settled}
            aria-label="Confirmar eliminación"
          >
            <Check size={14} strokeWidth={1.5} className="scripts-delete-confirm__btn-icon" aria-hidden="true" />
            <span className="scripts-delete-confirm__btn-label">Confirmar</span>
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--ghost dm-btn--sm scripts-delete-confirm__btn"
            onClick={close}
            disabled={settled}
            aria-label="Cancelar eliminación"
          >
            <X size={14} strokeWidth={1.5} className="scripts-delete-confirm__btn-icon" aria-hidden="true" />
            <span className="scripts-delete-confirm__btn-label">Cancelar</span>
          </button>
        </div>
        <div className="scripts-delete-confirm__progress">
          <div
            className="scripts-delete-confirm__progress-fill"
            onAnimationEnd={close}
          />
        </div>
      </div>
    </div>
  );
}

/** Feedback for "Ejecutar" — uploading progress, then a success/error message.
 * Same mount/open/close grid trick as `DeleteConfirmCard` above (entrance via
 * a rAF-delayed `open`, exit gated on the grid-template-rows transition
 * actually finishing) but with no confirm/cancel pair: `uploading` has no
 * auto-dismiss since the live percent is the content; `success`/`error`
 * auto-dismiss via their own 5s progress-fill animation (hover pauses it,
 * same as the delete countdown). The parent keys this by `status.id` so a
 * re-run on the same file always mounts a fresh instance instead of reusing
 * one that might still be mid-exit from a previous run. */
function ScriptActionStatusCard({
  status,
  onDismiss,
}: {
  status: ScriptActionStatus;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const close = () => setOpen(false);

  return (
    <div
      className={`scripts-action-status scripts-action-status--${status.kind}${open ? ' scripts-action-status--open' : ''}`}
      onTransitionEnd={(e) => {
        if (e.propertyName === 'grid-template-rows' && !open) onDismiss();
      }}
    >
      <div className="scripts-action-status__inner">
        {status.kind === 'uploading' ? (
          <>
            <span className="scripts-action-status__text">
              Subiendo script… {Math.round(status.percent)}%
            </span>
            <div className="scripts-action-status__progress">
              <div
                className="scripts-action-status__progress-fill"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          </>
        ) : status.kind === 'running' ? (
          <span className="scripts-action-status__text">Ejecutando script…</span>
        ) : (
          <>
            <span className="scripts-action-status__text">{status.message}</span>
            <div className="scripts-action-status__progress">
              <div className="scripts-action-status__progress-fill" onAnimationEnd={close} />
            </div>
          </>
        )}
      </div>
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
  danger?: boolean;
};

function EditorToolbarButton({ icon: Icon, label, onClick, active, pulse, pressed, disabled, danger }: EditorToolbarButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className={`scripts-toolbar-btn${active ? ' scripts-toolbar-btn--active' : ''}${pulse ? ' scripts-run-btn--active' : ''}${danger ? ' scripts-toolbar-btn--danger' : ''}`}
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

/** Standalone empty state shown in `.scripts-right` when no file is selected
 * — mutually exclusive with `.scripts-editor`, never nested inside it, so
 * the editor's tab/toolbar header never shows without an open file. */
function ScriptsEmptyState() {
  return (
    <div className="scripts-empty-state">
      <div className="scripts-empty-state__icon">
        <MousePointerSquareDashed size={20} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <p className="scripts-empty-state__title">Explora tus scripts</p>
      <p className="scripts-empty-state__sub">Esto es lo que puedes hacer con tus archivos:</p>
      <br />
      <ul className="scripts-empty-state__guide">
        <li className="scripts-empty-state__guide-item scripts-empty-state__guide-item--create">
          <span className="scripts-empty-state__guide-icon">
            <FilePlus2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="scripts-empty-state__guide-text">
            <strong>Crear</strong>
            <span>Define el nombre y formato de tu nuevo script.</span>
          </span>
        </li>
        <li className="scripts-empty-state__guide-item scripts-empty-state__guide-item--open">
          <span className="scripts-empty-state__guide-icon">
            <MousePointer2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="scripts-empty-state__guide-text">
            <strong>Editar</strong>
            <span>Un click sobre un script lo abre en el editor.</span>
          </span>
        </li>
        <li className="scripts-empty-state__guide-item scripts-empty-state__guide-item--delete">
          <span className="scripts-empty-state__guide-icon">
            <MouseRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <span className="scripts-empty-state__guide-text">
            <strong>Eliminar</strong>
            <span>Click derecho sobre un script y selecciona "Eliminar".</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

type PaneKey = 'empty' | 'editor';

/** Generic crossfade: whenever `activeKey` changes, the currently-shown
 * content fades out in place; once that fade-out finishes, content is
 * swapped for `render(activeKey)` and held invisible until `ready` is true,
 * then fades in. With no `ready` gate (default `true`) it's a plain
 * crossfade — used for the empty-state ↔ editor swap. With `ready` tied to
 * `!contentLoading`, the invisible wait doubles as the file-switch
 * transition: nothing is shown while the new file's content is being read,
 * then it fades in once available — same idiom, no separate loading visual.
 * Reuses the mount-invisible-then-flip-a-frame-later trick `DeleteConfirmCard`
 * uses for its entrance, just applied to a content swap instead of a mount. */
function CrossfadeSwap<K extends string>({
  activeKey,
  ready = true,
  className,
  render,
}: {
  activeKey: K;
  ready?: boolean;
  className: string;
  render: (key: K) => ReactNode;
}) {
  const [shown, setShown] = useState(activeKey);
  const [stage, setStage] = useState<'idle' | 'leaving' | 'entering'>(() => (ready ? 'idle' : 'entering'));

  // With reduced motion, the fade's CSS transition is dropped, so the
  // `onTransitionEnd` this state machine relies on would never fire — swap
  // immediately instead of waiting on a transition that won't happen.
  useEffect(() => {
    if (activeKey === shown || stage !== 'idle') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(activeKey);
      return;
    }
    setStage('leaving');
  }, [activeKey, shown, stage]);

  useEffect(() => {
    if (stage !== 'entering' || !ready) return;
    const raf = requestAnimationFrame(() => setStage('idle'));
    return () => cancelAnimationFrame(raf);
  }, [stage, ready]);

  return (
    <div
      className={`${className} scripts-fade${stage === 'idle' ? ' scripts-fade--visible' : ''}`}
      onTransitionEnd={(e) => {
        if (e.propertyName !== 'opacity' || stage !== 'leaving') return;
        setShown(activeKey);
        setStage('entering');
      }}
    >
      {render(shown)}
    </div>
  );
}

type ScriptsProps = {
  scripts: Scripts;
  connection: Connection;
};

export default function Scripts({ scripts, connection }: ScriptsProps) {
  const {
    directoryPath,
    setDirectoryPath,
    files,
    filesLoading,
    filesError,
    selected,
    selectFile,
    deselectFile,
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
    deleteFile,
    pendingDeletePath,
    requestDelete,
    cancelPendingDelete,
    renamingPath,
    renameError,
    startRename,
    confirmRename,
    cancelRename,
  } = scripts;

  const {
    status: actionStatus,
    executeScript,
    dismissStatus,
    cleanupRemoteCopy,
    renameRemoteCopy,
  } = useScriptRemote(connection);

  // Local rename is committed first; the remote copy (if any — see
  // `renameRemoteCopy`, a no-op when the script was never uploaded) is only
  // synced once the local rename actually succeeds.
  const handleConfirmRename = async (script: ScriptFileEntry, newName: string) => {
    try {
      await confirmRename(script.path, newName);
      renameRemoteCopy(script.name, newName);
    } catch {
      // confirmRename already recorded renameError for the UI.
    }
  };

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());

  // The toolbar trash icon targets the open file, which may be scrolled out
  // of view in a long list — bring it on screen so the confirmation card it
  // triggers is actually visible.
  const requestDeleteFromToolbar = (path: string) => {
    requestDelete(path);
    itemRefs.current.get(path)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Remote cleanup is fire-and-forget (see `cleanupRemoteCopy`) and never
  // delays the local delete on the SSH round-trip.
  const handleConfirmDelete = (path: string) => {
    const script = files.find((f) => f.path === path);
    if (script) cleanupRemoteCopy(script);
    void deleteFile(path);
  };

  // Close the context menu on any outside interaction or Escape — same
  // pattern as the terminal's copy-selection context menu.
  useEffect(() => {
    if (!contextMenu) return;

    const closeUnlessInsideMenu = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    const close = () => setContextMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
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

  const handlePickDirectory = async () => {
    const dir = await pickScriptDirectory();
    if (dir) setDirectoryPath(dir);
  };

  // The editor pane keeps rendering the last selected file's tab/toolbar
  // while it fades out after a deselect, instead of needing `selected`
  // (already null at that point) to build that JSX.
  const lastSelectedRef = useRef<ScriptFileEntry | null>(selected);
  useEffect(() => {
    if (selected) lastSelectedRef.current = selected;
  }, [selected]);
  const displaySelected = selected ?? lastSelectedRef.current;

  const isUploadingSelected =
    actionStatus?.kind === 'uploading' && actionStatus.path === displaySelected?.path;
  const isRunningSelected =
    actionStatus?.kind === 'running' && actionStatus.path === displaySelected?.path;
  const isBusySelected = isUploadingSelected || isRunningSelected;

  const subtitle = !directoryPath
    ? 'Selecciona un directorio para ver tus scripts'
    : filesLoading
      ? 'Cargando archivos…'
      : filesError
        ? filesError
        : `${files.length} archivo(s)`;

  return (
    <div className="dashboard__content-inner dm-section scripts-section">
      <div className="scripts-wrap">
        <div className="scripts-left" onClick={() => selected && deselectFile()}>
          <div className="scripts-left__head">
            <div className="dm-section-title">Scripts</div>
            <div className="dm-section-desc">{subtitle}</div>
          </div>

          <div className="scripts-list">
            <button type="button" className="dm-btn scripts-list__new" onClick={() => startCreate()} disabled={!directoryPath}>
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
                <Fragment key={script.path}>
                  <ScriptListItem
                    script={script}
                    active={script.path === selected?.path}
                    renaming={renamingPath === script.path}
                    renameError={renamingPath === script.path ? renameError : null}
                    onSelect={() => selectFile(script.path)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, path: script.path });
                    }}
                    onStartRename={() => startRename(script.path)}
                    onConfirmRename={(newName) => void handleConfirmRename(script, newName)}
                    onCancelRename={cancelRename}
                    itemRef={(el) => {
                      if (el) itemRefs.current.set(script.path, el);
                      else itemRefs.current.delete(script.path);
                    }}
                  />
                  {pendingDeletePath === script.path && (
                    <DeleteConfirmCard
                      onConfirm={() => void handleConfirmDelete(script.path)}
                      onCancel={cancelPendingDelete}
                    />
                  )}
                  {actionStatus?.path === script.path && (
                    <ScriptActionStatusCard
                      key={actionStatus.id}
                      status={actionStatus}
                      onDismiss={dismissStatus}
                    />
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="scripts-right">
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
            </button>
          </div>

          <CrossfadeSwap<PaneKey>
            activeKey={selected ? 'editor' : 'empty'}
            className="scripts-pane"
            render={(pane) =>
              pane === 'empty' ? (
                <ScriptsEmptyState />
              ) : !displaySelected ? null : (
                <div className="scripts-editor">
                  <div className="scripts-editor__tabs">
                    <div className="scripts-editor__tabs-left">
                      <div className="scripts-editor__tab scripts-editor__tab--active">
                        <FileCode size={14} strokeWidth={1.5} className="scripts-editor__tab-icon" aria-hidden="true" />
                        {displaySelected.name}
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
                        disabled={!dirty}
                      />
                      <EditorToolbarButton
                        icon={Trash2}
                        label="Eliminar archivo"
                        onClick={() => requestDeleteFromToolbar(displaySelected.path)}
                        danger
                      />
                      <EditorToolbarButton
                        icon={Zap}
                        label={isUploadingSelected ? 'Subiendo…' : isRunningSelected ? 'Ejecutando…' : 'Ejecutar'}
                        onClick={() => void executeScript(displaySelected, content, dirty, save)}
                        pulse={isBusySelected}
                        disabled={isBusySelected}
                      />
                    </div>
                  </div>
                  <CrossfadeSwap
                    activeKey={displaySelected.path}
                    ready={!contentLoading}
                    className="scripts-editor__body"
                    render={() =>
                      contentError ? (
                        <CodeBlock lines={[contentError]} />
                      ) : (
                        <CodeEditor value={content} onChange={setContent} />
                      )
                    }
                  />
                </div>
              )
            }
          />
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="scripts-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            type="button"
            className="scripts-context-menu-item scripts-context-menu-item--danger"
            onClick={() => {
              requestDelete(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
