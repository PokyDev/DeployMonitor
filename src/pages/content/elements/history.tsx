import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, FolderOpen, Maximize2, Search, Settings, Trash2, X } from 'lucide-react';
import type { useScriptHistory, ExecutionStatus, HistoryEntry } from '../../../hooks/use-script-history';
import { useHistoryFilters } from '../../../hooks/use-history-filters';
import { useDragSelect } from '../../../hooks/use-drag-select';
import { ExtensionIcon } from '../../../lib/script-extension';
import DirectoryPathField from './directory-path-field';
import HistoryFilterSidebar, { HistoryFilterDrawer } from './history-filter-sidebar';
import HistorySlidePanel from './history-slide-panel';
import HistoryLogTerminal from './history-log-terminal';
import HistoryLogExpanded from './history-log-expanded';
import HistoryContextMenu from './history-context-menu';
import HistoryDragOverlay from './history-drag-overlay';
import './history.css';

type History = ReturnType<typeof useScriptHistory>;

// Strips VT100/ANSI escape sequences so clipboard text is plain ASCII
const ANSI_RE = /\x1b(?:\[[0-9;]*[A-Za-z]|[@-Z\\-_]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;

const RESULT_BADGE: Record<ExecutionStatus, { variant: string; label: string }> = {
  success: { variant: 'normal', label: 'Éxito' },
  error:   { variant: 'critical', label: 'Error' },
};

function ResultBadge({ status }: { status: ExecutionStatus }) {
  const { variant, label } = RESULT_BADGE[status];
  return (
    <span className={`dm-badge dm-badge--${variant}`}>
      <span className="dm-badge__pip" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Stays mounted once an entry has been opened the first time, so the
 * closing slide-out transition has content to animate away instead of
 * unmounting (and going blank) the instant `selected` clears to null. */
function DetailSidebar({ history }: { history: History }) {
  const { selected, close, outputLoading } = history;
  const [lastEntry, setLastEntry] = useState<HistoryEntry | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    if (selected) {
      setLastEntry(selected);
      setExpanded(false);
      setCopyState('idle');
    }
  }, [selected]);

  const entry = selected ?? lastEntry;
  if (!entry) return null;

  const isOpen = !!selected;

  function handleCopy() {
    if (!entry?.output || copyState === 'copied') return;
    const plain = entry.output.replace(ANSI_RE, '');
    void navigator.clipboard.writeText(plain);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 2000);
  }

  return (
    <>
      <HistorySlidePanel isOpen={isOpen} onClose={close} ariaLabel={`Detalle de ejecución de ${entry.scriptName}`}>
        <div className="history-sidebar__head">
          <button type="button" className="dm-icon-btn history-sidebar__back" onClick={close} title="Volver" aria-label="Volver">
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <div className="history-sidebar__title">
            <ExtensionIcon scriptName={entry.scriptName} variant="modal" />
            <span>{entry.scriptName}</span>
          </div>
        </div>
        <div className="history-sidebar__body">
          <div className="history-stat-grid">
            <div className="history-stat">
              <span className="history-stat__key">Ejecutado por</span>
              <span className="history-stat__value history-stat__value--gold">{entry.triggeredBy}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Estado</span>
              <span className="history-stat__value"><ResultBadge status={entry.status} /></span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Duración</span>
              <span className="history-stat__value">{entry.duration}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Fecha</span>
              <span className="history-stat__value">{entry.timestamp}</span>
            </div>
          </div>
          <div className="history-log-term-header">
            <div className="dm-label">Salida de terminal</div>
            {entry.output !== undefined && (
              <div className="history-log-term-actions">
                <div className="history-log-term-copy-wrap">
                  <button
                    type="button"
                    className={`history-log-term-action${copyState === 'copied' ? ' history-log-term-action--copied' : ''}`}
                    onClick={handleCopy}
                    title={copyState === 'copied' ? 'Copiado' : 'Copiar salida'}
                    aria-label="Copiar salida de terminal"
                  >
                    {copyState === 'copied'
                      ? <Check size={13} strokeWidth={2} aria-hidden="true" />
                      : <Copy size={13} strokeWidth={1.5} aria-hidden="true" />
                    }
                  </button>
                  {copyState === 'copied' && (
                    <span className="history-copy-toast" role="status">Contenido copiado</span>
                  )}
                </div>
                <button
                  type="button"
                  className="history-log-term-action"
                  onClick={() => setExpanded(true)}
                  title="Expandir vista"
                  aria-label="Expandir salida de terminal"
                >
                  <Maximize2 size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <div className="history-log-term">
            {entry.output === undefined ? (
              <div className="history-log-term__placeholder">
                {outputLoading ? 'Cargando salida…' : 'Sin datos de salida.'}
              </div>
            ) : (
              <HistoryLogTerminal output={entry.output} />
            )}
          </div>
        </div>
      </HistorySlidePanel>
      {expanded && entry.output !== undefined && (
        <HistoryLogExpanded output={entry.output} onClose={() => setExpanded(false)} />
      )}
    </>
  );
}

/** `index` only drives the entrance stagger delay (capped so long lists
 * don't feel sluggish) — the grid is remounted by filter signature, so this
 * replays every time the visible set changes instead of just on first paint. */
function HistoryCard({
  entry,
  index,
  isSelected,
  onOpen,
  onToggleSelect,
  onContextMenu,
}: {
  entry: HistoryEntry;
  index: number;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={`history-card${isSelected ? ' history-card--selected' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      data-entry-id={entry.id}
      onClick={onOpen}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <button
        type="button"
        className="history-card__select"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        aria-label={isSelected ? 'Deseleccionar' : 'Seleccionar'}
        aria-pressed={isSelected}
        title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
      >
        {isSelected && <Check size={12} strokeWidth={2.5} aria-hidden="true" />}
      </button>
      <div className="history-card__head">
        <ExtensionIcon scriptName={entry.scriptName} />
        <span className="history-card__name" title={entry.scriptName}>{entry.scriptName}</span>
      </div>
      <div className="history-card__foot">
        <span className="history-card__date">{entry.timestamp}</span>
        <ResultBadge status={entry.status} />
      </div>
    </div>
  );
}

function HistorySelectionBar({
  count,
  onClear,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="history-selection-bar">
      <span className="history-selection-bar__count">
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={onClear}>
        Deseleccionar
      </button>
      <button type="button" className="dm-btn dm-btn--danger dm-btn--sm" onClick={onDelete}>
        <Trash2 size={13} strokeWidth={1.5} aria-hidden="true" />
        Eliminar
      </button>
    </div>
  );
}

function HistoryEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="history-empty">
      <Search size={22} strokeWidth={1.5} aria-hidden="true" />
      <span>No se encontraron ejecuciones que coincidan con la búsqueda o los filtros.</span>
      <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={onClear}>
        Limpiar búsqueda y filtros
      </button>
    </div>
  );
}

/** Covers the three "there's no grid to show" states that didn't exist with
 * the old hardcoded mock (always 6 entries) but are real now that the list
 * comes from disk: still loading, a read error, or a directory with no
 * run-history files yet. Distinct from `HistoryEmptyState`, which is only
 * for "filters matched zero of N existing entries". */
function HistoryStatusState({ text }: { text: string }) {
  return (
    <div className="history-empty">
      <FolderOpen size={22} strokeWidth={1.5} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

type HistoryProps = {
  history: History;
};

export default function HistoryView({ history }: HistoryProps) {
  const {
    history: entries,
    loading,
    error,
    refresh,
    logsDirectoryPath,
    open,
    selected,
    setLogsDirectoryPath,
    selectedIds,
    toggleSelect,
    clearSelection,
    addToSelection,
    deleteSelected,
    deleteSingle,
  } = history;
  const filters = useHistoryFilters(entries);
  const { query, setQuery, filtered, filterSignature, clearFilters, hasActiveFilters } = filters;
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    label: string;
    onConfirm: () => void;
  } | null>(null);

  // Set to true when a drag completes so the trailing `click` event the browser
  // fires after pointerup doesn't immediately clear the just-committed selection.
  const dragJustEndedRef = useRef(false);

  const handleDragEnd = useCallback((ids: string[]) => {
    dragJustEndedRef.current = true;
    if (ids.length > 0) addToSelection(ids);
  }, [addToSelection]);

  const { isDragging, dragRect, liveIds } = useDragSelect({
    enabled: selected === null && !filterDrawerOpen,
    onDragEnd: handleDragEnd,
  });

  // Click on any area outside cards/buttons/selection-bar clears the selection.
  // Uses `click` (not `pointerdown`) so drags that start from empty space don't
  // accidentally clear the selection before the drag adds new items.
  const hasSelection = selectedIds.size > 0;
  useEffect(() => {
    if (!hasSelection) return;

    function onDocClick(e: MouseEvent) {
      if (dragJustEndedRef.current) {
        dragJustEndedRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('[data-entry-id]') ||
        target.closest('.history-ctx-menu') ||
        target.closest('.history-selection-bar')
      ) return;
      clearSelection();
    }

    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [hasSelection, clearSelection]);

  // `history` (the hook) lives in the parent (`content.tsx`) and outlives this
  // view's own mount/unmount as the user switches sections, so its one-time
  // mount effect won't re-fire here — without this, running a script and then
  // opening Historial would show whatever was cached from the last time this
  // view happened to be open, not the run that just finished.
  useEffect(() => {
    void refresh(logsDirectoryPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCardContextMenu(e: React.MouseEvent, cardId: string) {
    e.preventDefault();
    const isGroupDelete = selectedIds.has(cardId);
    const count = isGroupDelete ? selectedIds.size : 1;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      label: count > 1 ? `Eliminar ${count} seleccionados` : 'Eliminar',
      onConfirm: isGroupDelete
        ? () => { void deleteSelected(logsDirectoryPath); }
        : () => { void deleteSingle(cardId, logsDirectoryPath); },
    });
  }

  return (
    <div className="dashboard__content-inner dm-section">
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Historial de ejecuciones</div>
          <div className="dm-section-desc">
            {filtered.length === entries.length
              ? `${entries.length} ejecuciones registradas`
              : `${filtered.length} de ${entries.length} ejecuciones`}
          </div>
        </div>
        {/* Only visible at minimized window widths — the permanent rail
           (`HistoryFilterSidebar`) covers this on a maximized window. */}
        <button
          type="button"
          className={`dm-icon-btn history-filter-trigger${hasActiveFilters ? ' dm-icon-btn--active' : ''}`}
          onClick={() => setFilterDrawerOpen(true)}
          title="Filtros y configuración"
          aria-label="Abrir filtros y configuración"
          aria-pressed={hasActiveFilters}
        >
          <Settings size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="history-layout">
        <HistoryFilterSidebar filters={filters} />

        <div className="history-main">
          {/* Lives here (not in `.dm-section-bar`) and shares `.history-grid`'s
             column template so the search bar lines up with the left pair of
             cards and the logs-directory field with the right pair, instead of
             being sized against the full section-bar width. */}
          <div className="history-toolbar-row">
            <div className="history-search">
              <Search size={15} strokeWidth={1.5} aria-hidden="true" className="history-search__icon" />
              <input
                type="text"
                className="history-search__input"
                placeholder="Buscar script…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar por nombre de script"
              />
              {query && (
                <button
                  type="button"
                  className="history-search__clear"
                  onClick={() => setQuery('')}
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              )}
            </div>
            {/* Only visible on a maximized window — the minimized drawer
               (`HistoryFilterDrawer`) carries this same field instead, since
               there's no room for it inline at that width. */}
            <DirectoryPathField
              path={logsDirectoryPath}
              onChange={setLogsDirectoryPath}
              className="history-dir-field"
              placeholder="Carpeta de logs no configurada"
              ariaLabel="Carpeta de logs"
            />
          </div>

          {selectedIds.size > 0 && (
            <HistorySelectionBar
              count={selectedIds.size}
              onClear={clearSelection}
              onDelete={() => { void deleteSelected(logsDirectoryPath); }}
            />
          )}

          {loading ? (
            <HistoryStatusState text="Cargando historial…" />
          ) : error ? (
            <HistoryStatusState text={error} />
          ) : entries.length === 0 ? (
            <HistoryStatusState text="Aún no hay ejecuciones registradas." />
          ) : filtered.length > 0 ? (
            <div className="history-grid" key={filterSignature}>
              {filtered.map((entry, index) => (
                <HistoryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  isSelected={selectedIds.has(entry.id) || liveIds.has(entry.id)}
                  onOpen={() => open(entry.id)}
                  onToggleSelect={() => toggleSelect(entry.id)}
                  onContextMenu={(e) => handleCardContextMenu(e, entry.id)}
                />
              ))}
            </div>
          ) : (
            <HistoryEmptyState onClear={() => { setQuery(''); clearFilters(); }} />
          )}
        </div>
      </div>

      <DetailSidebar history={history} />
      <HistoryFilterDrawer
        filters={filters}
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        logsDirectoryPath={logsDirectoryPath}
        onLogsDirectoryChange={setLogsDirectoryPath}
      />
      {contextMenu && (
        <HistoryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={contextMenu.label}
          onConfirm={contextMenu.onConfirm}
          onClose={() => setContextMenu(null)}
        />
      )}
      {isDragging && dragRect && <HistoryDragOverlay dragRect={dragRect} />}
    </div>
  );
}
