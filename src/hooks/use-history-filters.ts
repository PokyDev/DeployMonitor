import { useCallback, useMemo, useState } from 'react';
import type { ExecutionStatus, HistoryEntry } from './use-script-history';
import { getExtensionKey, type ExtensionKey } from '../lib/script-extension';

export type StatusFilter = 'all' | ExecutionStatus;
export type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

export const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all',     label: 'Todos' },
  { key: 'success', label: 'Éxito' },
  { key: 'error',   label: 'Error' },
];

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'date-desc', label: 'Más recientes' },
  { key: 'date-asc',  label: 'Más antiguos' },
  { key: 'name-asc',  label: 'A-Z' },
  { key: 'name-desc', label: 'Z-A' },
];

const DEFAULT_SORT: SortKey = 'date-desc';

function sortEntries(entries: HistoryEntry[], sort: SortKey): HistoryEntry[] {
  const sorted = [...entries];
  switch (sort) {
    case 'date-desc':
      return sorted.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    case 'date-asc':
      return sorted.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    case 'name-asc':
      return sorted.sort((a, b) => a.scriptName.localeCompare(b.scriptName));
    case 'name-desc':
      return sorted.sort((a, b) => b.scriptName.localeCompare(a.scriptName));
  }
}

/** Search/filter/sort UI state for the Historial view — derives the visible
 * list from `entries` without touching use-script-history's data/log concerns. */
export function useHistoryFilters(entries: HistoryEntry[]) {
  const [query, setQuery] = useState('');
  const [extensions, setExtensions] = useState<Set<ExtensionKey>>(new Set());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  const toggleExtension = useCallback((ext: ExtensionKey) => {
    setExtensions((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setExtensions(new Set());
    setStatus('all');
    setSort(DEFAULT_SORT);
  }, []);

  const availableExtensions = useMemo(() => {
    const present = new Set<ExtensionKey>();
    for (const entry of entries) present.add(getExtensionKey(entry.scriptName));
    return (['sh', 'py', 'js', 'default'] as ExtensionKey[]).filter((ext) => present.has(ext));
  }, [entries]);

  const extensionCounts = useMemo(() => {
    const counts: Partial<Record<ExtensionKey, number>> = {};
    for (const entry of entries) {
      const key = getExtensionKey(entry.scriptName);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entries]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: entries.length, success: 0, error: 0 };
    for (const entry of entries) counts[entry.status]++;
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTextAndFacets = entries.filter((entry) => {
      if (q && !entry.scriptName.toLowerCase().includes(q)) return false;
      if (extensions.size > 0 && !extensions.has(getExtensionKey(entry.scriptName))) return false;
      if (status !== 'all' && entry.status !== status) return false;
      return true;
    });
    return sortEntries(byTextAndFacets, sort);
  }, [entries, query, extensions, status, sort]);

  const hasActiveFilters = extensions.size > 0 || status !== 'all' || sort !== DEFAULT_SORT;

  /** Identifies the current facet combination so callers can key off it to
   * replay entrance animations when the visible set changes. */
  const filterSignature = `${query}|${[...extensions].sort().join(',')}|${status}|${sort}`;

  return {
    query,
    setQuery,
    extensions,
    toggleExtension,
    status,
    setStatus,
    sort,
    setSort,
    clearFilters,
    hasActiveFilters,
    availableExtensions,
    extensionCounts,
    statusCounts,
    filtered,
    filterSignature,
  };
}
