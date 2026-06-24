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

// Same store + key the Scripts editor persists its chosen directory to
// (`use-script-files.ts`) — Historial has no directory picker of its own,
// it just reads whatever `outputs/` subfolder lives under that directory.
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
 * file per execution from `<directoryPath>/outputs/` via `script_log_list`/
 * `script_log_get` instead of an inline array. `output` is fetched on demand
 * only when a card is opened, mirroring `loadContent` in `use-script-files.ts`. */
export function useScriptHistory() {
  const [directoryPath, setDirectoryPath] = useState('');

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [outputLoading, setOutputLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await scriptsStore.get<string>('directoryPath');
      if (active && saved) setDirectoryPath(saved);
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
    void refresh(directoryPath);
  }, [directoryPath, refresh]);

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

  return { history: entries, loading, error, selected, outputLoading, open, close };
}
