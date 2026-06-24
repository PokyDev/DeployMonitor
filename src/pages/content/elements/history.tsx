import { useEffect, useState } from 'react';
import { ArrowLeft, ListFilter, Search, X } from 'lucide-react';
import { buildLogs } from '../../../hooks/use-mock-history';
import type { useMockHistory, ExecutionResult, HistoryEntry } from '../../../hooks/use-mock-history';
import { useHistoryFilters } from '../../../hooks/use-history-filters';
import { ExtensionIcon } from '../../../lib/script-extension';
import HistoryFilterSidebar, { HistoryFilterDrawer } from './history-filter-sidebar';
import HistorySlidePanel from './history-slide-panel';
import './history.css';

type History = ReturnType<typeof useMockHistory>;

const RESULT_BADGE: Record<ExecutionResult, { variant: string; label: string }> = {
  success: { variant: 'normal', label: 'Éxito' },
  failed:  { variant: 'critical', label: 'Error' },
};

function ResultBadge({ result }: { result: ExecutionResult }) {
  const { variant, label } = RESULT_BADGE[result];
  return (
    <span className={`dm-badge dm-badge--${variant}`}>
      <span className="dm-badge__pip" aria-hidden="true" />
      {label}
    </span>
  );
}

type LogLineKind = 'prompt' | 'ok' | 'err' | 'info' | 'out';

function classifyLine(line: string): LogLineKind {
  if (/^\[\d{2}:\d{2}:\d{2}\]\s*✔/.test(line) || line.includes('✓ ')) return 'ok';
  if (line.includes('✗')) return 'err';
  if (line.includes('▶')) return 'info';
  if (line.startsWith('ubuntu@')) return 'prompt';
  return 'out';
}

/** Stays mounted once an entry has been opened the first time, so the
 * closing slide-out transition has content to animate away instead of
 * unmounting (and going blank) the instant `selected` clears to null. */
function DetailSidebar({ history }: { history: History }) {
  const { selected, close } = history;
  const [lastEntry, setLastEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (selected) setLastEntry(selected);
  }, [selected]);

  const entry = selected ?? lastEntry;
  if (!entry) return null;

  const isOpen = !!selected;
  const logs = buildLogs(entry);

  return (
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
            <span className="history-stat__value"><ResultBadge result={entry.result} /></span>
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
        <div className="dm-label" style={{ marginBottom: 8 }}>Salida de terminal</div>
        <div className="history-log-term">
          {logs.map((line, i) => (
            <div key={i} className={`history-log-term__line history-log-term__line--${classifyLine(line)}`}>{line}</div>
          ))}
        </div>
      </div>
    </HistorySlidePanel>
  );
}

/** `index` only drives the entrance stagger delay (capped so long lists
 * don't feel sluggish) — the grid is remounted by filter signature, so this
 * replays every time the visible set changes instead of just on first paint. */
function HistoryCard({ entry, index, onOpen }: { entry: HistoryEntry; index: number; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="history-card"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="history-card__head">
        <ExtensionIcon scriptName={entry.scriptName} />
        <span className="history-card__name" title={entry.scriptName}>{entry.scriptName}</span>
      </div>
      <div className="history-card__foot">
        <span className="history-card__date">{entry.timestamp}</span>
        <ResultBadge result={entry.result} />
      </div>
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

type HistoryProps = {
  history: History;
};

export default function HistoryView({ history }: HistoryProps) {
  const { history: entries, open } = history;
  const filters = useHistoryFilters(entries);
  const { query, setQuery, filtered, filterSignature, clearFilters, hasActiveFilters } = filters;
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

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
        <div className="history-toolbar">
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
          {/* Only visible at minimized window widths — the permanent rail
             (`HistoryFilterSidebar`) covers this on a maximized window. */}
          <button
            type="button"
            className={`dm-icon-btn history-filter-trigger${hasActiveFilters ? ' dm-icon-btn--active' : ''}`}
            onClick={() => setFilterDrawerOpen(true)}
            title="Filtros"
            aria-label="Abrir filtros"
            aria-pressed={hasActiveFilters}
          >
            <ListFilter size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="history-layout">
        <HistoryFilterSidebar filters={filters} />

        <div className="history-main">
          {filtered.length > 0 ? (
            <div className="history-grid" key={filterSignature}>
              {filtered.map((entry, index) => (
                <HistoryCard key={entry.id} entry={entry} index={index} onOpen={() => open(entry.id)} />
              ))}
            </div>
          ) : (
            <HistoryEmptyState onClear={() => { setQuery(''); clearFilters(); }} />
          )}
        </div>
      </div>

      <DetailSidebar history={history} />
      <HistoryFilterDrawer filters={filters} isOpen={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)} />
    </div>
  );
}
