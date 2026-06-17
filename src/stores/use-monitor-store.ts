import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { monitorStart, monitorStop } from '../lib/tauri-commands';
import type { MetricSnapshot } from '../lib/tauri-commands';
import type { MetricPoint } from '../lib/metrics';

// Module-level — prevents double-registration of the monitor:* listeners in React StrictMode.
let _monitorListening = false;

// Real samples now arrive roughly every ~3s (2s poll + ~1-1.5s CPU delta
// sample) instead of ~5.5s — bumped from 30 to keep a similar ~2min window.
const HISTORY_CAP = 40;

export type MonitorHistory = {
  cpu: MetricPoint[];
  mem: MetricPoint[];
  disk: MetricPoint[];
  swap: MetricPoint[];
  load1: MetricPoint[];
  load5: MetricPoint[];
  load15: MetricPoint[];
  netRx: MetricPoint[];
  netTx: MetricPoint[];
};

function emptyHistory(): MonitorHistory {
  return {
    cpu: [], mem: [], disk: [], swap: [],
    load1: [], load5: [], load15: [],
    netRx: [], netTx: [],
  };
}

function pushPoint(history: MetricPoint[], point: MetricPoint): MetricPoint[] {
  const next = [...history, point];
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
}

type MonitorErrorPayload = { message: string };

type MonitorStore = {
  /** Most recent raw snapshot from the backend, or null before the first sample arrives. */
  latest: MetricSnapshot | null;
  /** Set once polling has failed 3+ consecutive times; cleared on the next successful sample. */
  lastError: string | null;
  history: MonitorHistory;

  init: () => Promise<void>;
  start: (pemPath: string, user: string, host: string, port?: number) => Promise<void>;
  stop: () => Promise<void>;
};

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  latest: null,
  lastError: null,
  history: emptyHistory(),

  init: async () => {
    if (_monitorListening) return;
    _monitorListening = true;

    await listen<MetricSnapshot>('monitor:metrics-update', (event) => {
      const snapshot = event.payload;
      const t = Date.parse(snapshot.sampled_at) || Date.now();
      const prev = get().history;

      set({
        latest: snapshot,
        lastError: null,
        history: {
          cpu: pushPoint(prev.cpu, { t, v: snapshot.cpu_pct }),
          mem: pushPoint(prev.mem, { t, v: (snapshot.mem_used_mb / snapshot.mem_total_mb) * 100 }),
          disk: pushPoint(prev.disk, { t, v: (snapshot.disk_used_gb / snapshot.disk_total_gb) * 100 }),
          swap: pushPoint(prev.swap, { t, v: snapshot.swap_total_mb > 0 ? (snapshot.swap_used_mb / snapshot.swap_total_mb) * 100 : 0 }),
          load1: pushPoint(prev.load1, { t, v: snapshot.load_avg_1 }),
          load5: pushPoint(prev.load5, { t, v: snapshot.load_avg_5 }),
          load15: pushPoint(prev.load15, { t, v: snapshot.load_avg_15 }),
          netRx: pushPoint(prev.netRx, { t, v: snapshot.net_rx_mbs }),
          netTx: pushPoint(prev.netTx, { t, v: snapshot.net_tx_mbs }),
        },
      });
    });

    await listen<MonitorErrorPayload>('monitor:metrics-error', (event) => {
      set({ lastError: event.payload.message });
    });
  },

  start: async (pemPath, user, host, port) => {
    await monitorStart(pemPath, user, host, port);
  },

  stop: async () => {
    await monitorStop();
    set({ latest: null, lastError: null, history: emptyHistory() });
  },
}));
