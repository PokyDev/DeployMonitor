import { useEffect, useState } from 'react';
import { useMonitorStore } from '../stores/use-monitor-store';
import { statusFor } from '../lib/metrics';
import type { LiveMetricId, MetricPoint, MetricState } from '../lib/metrics';

// Local "tween" tick — independent of the ~3s real sampling cadence. Cheap
// enough at this rate for a handful of small sparklines; not a full 60fps rAF loop.
const TWEEN_TICK_MS = 120;

// Fixed ease-toward-target window, deliberately decoupled from the real
// polling cadence (which can vary with network latency). Short enough to
// settle well before the next sample at the current ~3s cadence.
const EASE_DURATION_MS = 800;

function formatGb(mb: number): string {
  const gb = mb / 1024;
  return gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 2;
}

/** Drives a `now` timestamp at TWEEN_TICK_MS so series can ease toward the
 * latest real sample instead of jumping flat every poll. Disabled (returns a
 * static `Date.now()`) under prefers-reduced-motion. */
function useNowTick(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setNow(Date.now()), TWEEN_TICK_MS);
    return () => clearInterval(id);
  }, []);

  return now;
}

/** Replaces the trailing point of a real-sample history with a value that
 * eases from the previous real sample toward the latest one over a fixed
 * short window starting the moment the new sample arrives — so both the
 * sparkline and the numeric readout glide into place instead of snapping,
 * then hold steady until the next real sample shifts the target again. */
function smooth(history: MetricPoint[], now: number): { value: number; history: MetricPoint[] } {
  if (history.length === 0) return { value: 0, history };
  if (history.length === 1) return { value: history[0].v, history };

  const prev = history[history.length - 2];
  const last = history[history.length - 1];
  const t = Math.min(Math.max((now - last.t) / EASE_DURATION_MS, 0), 1);
  const value = lerp(prev.v, last.v, easeOut(t));

  return { value, history: [...history.slice(0, -1), { t: now, v: value }] };
}

/**
 * Converts the monitor store's raw snapshot + rolling history into the same
 * `Record<id, MetricState>` shape `MetricCard`/`ResourceChart` already render
 * for mock data — so Overview's and Monitor's "live" rendering paths need no
 * changes, only their data source. Returns null before the first real sample
 * has arrived.
 */
export function useLiveMetrics(): Record<LiveMetricId, MetricState> | null {
  const latest = useMonitorStore((s) => s.latest);
  const history = useMonitorStore((s) => s.history);
  const now = useNowTick();

  if (!latest) return null;

  const cpu = smooth(history.cpu, now);
  const mem = smooth(history.mem, now);
  const disk = smooth(history.disk, now);
  const swap = smooth(history.swap, now);
  const load1 = smooth(history.load1, now);
  const load5 = smooth(history.load5, now);
  const load15 = smooth(history.load15, now);
  const netRx = smooth(history.netRx, now);
  const netTx = smooth(history.netTx, now);

  return {
    cpu: {
      value: cpu.value,
      history: cpu.history,
      longHistory: [cpu.history],
      status: statusFor('cpu', cpu.value),
      detail: null,
    },
    mem: {
      value: mem.value,
      history: mem.history,
      longHistory: [mem.history],
      status: statusFor('mem', mem.value),
      detail: `de ${formatGb(latest.mem_total_mb)} GB`,
    },
    disk: {
      value: disk.value,
      history: disk.history,
      longHistory: [disk.history],
      status: statusFor('disk', disk.value),
      detail: `de ${latest.disk_total_gb.toFixed(0)} GB`,
    },
    swap: {
      value: swap.value,
      history: swap.history,
      longHistory: [swap.history],
      status: statusFor('swap', swap.value),
      detail: latest.swap_total_mb > 0 ? `de ${formatGb(latest.swap_total_mb)} GB` : 'sin swap configurado',
    },
    net: {
      value: netRx.value,
      history: netRx.history,
      longHistory: [netRx.history, netTx.history],
      status: statusFor('net', netRx.value),
      detail: 'MB/s',
    },
    load: {
      value: load1.value,
      history: load1.history,
      longHistory: [load1.history, load5.history, load15.history],
      status: statusFor('load', load1.value),
      detail: '1 min',
    },
  };
}
