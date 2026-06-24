import { useCallback, useEffect, useState } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { scriptLogGet, scriptLogList, type ScriptLogSummary } from '../lib/tauri-commands';
import { formatDuration, formatTimestamp } from '../lib/formatters';

export type ExecutionStatus = 'success' | 'error';

export type HistoryEntry = {
  id: string;
  scriptName: string;
  triggeredBy: string;
  timestamp: string;
  duration: string;
  status: ExecutionStatus;
  output?: string;
};

// Historial's own store — independent of the Scripts editor's
// `scripts-settings.json`, since the logs folder is no longer derived from
// the scripts directory (see `spec-backend.md` § "Script Run History").
const historyStore = new LazyStore('history-settings.json');

// Read-only peek at the Scripts editor's store, used once to migrate
// existing users onto a sensible default (see the mount effect below).
const scriptsStore = new LazyStore('scripts-settings.json');

function toHistoryEntry(summary: ScriptLogSummary): HistoryEntry {
  return {
    id: summary.path,
    scriptName: summary.script_name,
    triggeredBy: summary.triggered_by,
    timestamp: formatTimestamp(summary.started_at),
    duration: formatDuration(summary.duration_ms),
    status: summary.status,
  };
}

function errorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  return e.message ?? String(err);
}

/** Disk-backed replacement for the old `useMockHistory` — reads one JSON
 * file per execution from `logsDirectoryPath` via `script_log_list`/
 * `script_log_get` instead of an inline array. `output` is fetched on demand
 * only when a card is opened, mirroring `loadContent` in `use-script-files.ts`. */
export function useScriptHistory() {
  const [logsDirectoryPath, setLogsDirectoryPathState] = useState('');

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [outputLoading, setOutputLoading] = useState(false);

  const setLogsDirectoryPath = useCallback((value: string) => {
    setLogsDirectoryPathState(value);
    void historyStore.set('logsDirectoryPath', value);
  }, []);

  // Restore the persisted logs directory once on mount. If the user never
  // configured one yet, migrate from the Scripts directory's `outputs/`
  // subfolder (the implicit location this used to be tied to) so existing
  // run-history doesn't disappear the moment this setting becomes
  // independent — then persist that as the explicit choice going forward.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await historyStore.get<string>('logsDirectoryPath');
      if (!active) return;
      if (saved) {
        setLogsDirectoryPathState(saved);
        return;
      }
      const scriptsDir = await scriptsStore.get<string>('directoryPath');
      if (!active || !scriptsDir) return;
      const migrated = `${scriptsDir}/outputs`;
      setLogsDirectoryPathState(migrated);
      void historyStore.set('logsDirectoryPath', migrated);
    })();
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async (dir: string) => {
    if (!dir) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const summaries = await scriptLogList(dir);
      setEntries(summaries.map(toHistoryEntry));
    } catch (err) {
      setError(errorMessage(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(logsDirectoryPath);
  }, [logsDirectoryPath, refresh]);

  const open = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (id in outputs) return;
      setOutputLoading(true);
      scriptLogGet(id)
        .then((full) => setOutputs((prev) => ({ ...prev, [id]: full.output })))
        .catch((err) => console.error('No se pudo leer la salida del log:', errorMessage(err)))
        .finally(() => setOutputLoading(false));
    },
    [outputs],
  );

  const close = useCallback(() => setSelectedId(null), []);

  const selectedSummary = entries.find((e) => e.id === selectedId) ?? null;
  const selected = selectedSummary ? { ...selectedSummary, output: outputs[selectedSummary.id] } : null;

  return {
    history: entries,
    loading,
    error,
    selected,
    outputLoading,
    open,
    close,
    logsDirectoryPath,
    setLogsDirectoryPath,
  };
}
