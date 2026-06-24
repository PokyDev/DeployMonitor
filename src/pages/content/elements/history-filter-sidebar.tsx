import { ArrowLeft, ListFilter, X } from 'lucide-react';
import type { useHistoryFilters } from '../../../hooks/use-history-filters';
import { STATUS_OPTIONS, SORT_OPTIONS } from '../../../hooks/use-history-filters';
import { EXTENSION_STYLE, ExtensionIconForKey } from '../../../lib/script-extension';
import HistorySlidePanel from './history-slide-panel';
import './history-filter-sidebar.css';

type Filters = ReturnType<typeof useHistoryFilters>;

/** The filter form itself — shared by the permanent desktop rail
 * (`HistoryFilterSidebar`) and the mobile slide-in drawer
 * (`HistoryFilterDrawer`), which only differ in the chrome wrapped around it. */
function HistoryFilterFacets({ filters }: { filters: Filters }) {
  const {
    extensions, toggleExtension, availableExtensions, extensionCounts,
    status, setStatus, statusCounts,
    sort, setSort,
    hasActiveFilters, clearFilters,
  } = filters;

  return (
    <>
      {availableExtensions.length > 0 && (
        <div className="history-filter-section">
          <span className="dm-label">Tipo de archivo</span>
          <div className="history-filter-chips">
            {availableExtensions.map((ext) => {
              const active = extensions.has(ext);
              return (
                <button
                  key={ext}
                  type="button"
                  className={`history-filter-chip history-filter-chip--${EXTENSION_STYLE[ext].tone}${active ? ' history-filter-chip--active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleExtension(ext)}
                >
                  <ExtensionIconForKey extKey={ext} variant="filter" />
                  <span>{EXTENSION_STYLE[ext].label}</span>
                  <span className="history-filter-chip__count">{extensionCounts[ext] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="history-filter-section">
        <span className="dm-label">Estado</span>
        <div className="history-segmented" role="tablist" aria-label="Filtrar por estado">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={status === opt.key}
              className={`history-segmented__tab${status === opt.key ? ' history-segmented__tab--active' : ''}`}
              onClick={() => setStatus(opt.key)}
            >
              {opt.label}
              <span className="history-segmented__count">{statusCounts[opt.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="history-filter-section">
        <span className="dm-label">Ordenar por</span>
        <div className="history-segmented history-segmented--vertical" role="tablist" aria-label="Ordenar resultados">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={sort === opt.key}
              className={`history-segmented__tab${sort === opt.key ? ' history-segmented__tab--active' : ''}`}
              onClick={() => setSort(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm history-filter-sidebar__clear" onClick={clearFilters}>
          <X size={13} strokeWidth={1.5} aria-hidden="true" />
          Limpiar filtros
        </button>
      )}
    </>
  );
}

/** Permanent left rail — desktop / maximized window. */
export default function HistoryFilterSidebar({ filters }: { filters: Filters }) {
  return (
    <aside className="history-filter-sidebar" aria-label="Filtros del historial">
      <div className="history-filter-sidebar__head">
        <ListFilter size={15} strokeWidth={1.5} aria-hidden="true" />
        <span>Filtros</span>
      </div>
      <HistoryFilterFacets filters={filters} />
    </aside>
  );
}

/** Minimized-window equivalent of `HistoryFilterSidebar` — same facets, in
 * the same slide-in shell the execution detail view uses, since there's no
 * room for a permanent rail once the window is small. */
export function HistoryFilterDrawer({ filters, isOpen, onClose }: { filters: Filters; isOpen: boolean; onClose: () => void }) {
  return (
    <HistorySlidePanel isOpen={isOpen} onClose={onClose} ariaLabel="Filtros del historial">
      <div className="history-sidebar__head">
        <button type="button" className="dm-icon-btn history-sidebar__back" onClick={onClose} title="Cerrar" aria-label="Cerrar filtros">
          <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <div className="history-sidebar__title">
          <ListFilter className="history-filter-drawer-icon" size={15} strokeWidth={1.5} aria-hidden="true" />
          <span>Filtros</span>
        </div>
      </div>
      <div className="history-sidebar__body">
        <HistoryFilterFacets filters={filters} />
      </div>
    </HistorySlidePanel>
  );
}
