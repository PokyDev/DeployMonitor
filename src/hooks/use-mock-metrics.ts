import { useEffect, useRef, useState } from 'react';

export type MetricStatus = 'normal' | 'warning' | 'critical';
export type MetricId = 'cpu' | 'mem' | 'disk' | 'swap' | 'net' | 'load';

export type MetricPoint = { t: number; v: number };

export type MetricState = {
  value: number;
  history: MetricPoint[];
  longHistory: MetricPoint[][];
  status: MetricStatus;
  detail: string | null;
};

type Range = { amp: number; lo: number; hi: number };

const RANGES: Record<MetricId, Range> = {
  cpu:  { amp: 6,    lo: 8,    hi: 92 },
  mem:  { amp: 2.2,  lo: 48,   hi: 78 },
  disk: { amp: 0.6,  lo: 45,   hi: 54 },
  swap: { amp: 1.4,  lo: 5,    hi: 26 },
  net:  { amp: 1.6,  lo: 0.3,  hi: 9.5 },
  load: { amp: 0.35, lo: 0.2,  hi: 3.6 },
};

const DETAILS: Record<MetricId, string | null> = {
  cpu: null,
  mem: 'de 7.8 GB',
  disk: 'de 80 GB',
  swap: 'de 2 GB',
  net: 'MB/s',
  load: '1 min',
};

const TICK_MS = 2000;
const SHORT_POINTS = 22;
const LONG_POINTS = 40;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function walk(n: number, base: number, amp: number, lo: number, hi: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v = clamp(v + (Math.random() - 0.5) * amp, lo, hi);
    out.push(v);
  }
  return out;
}

function toSeries(values: number[], now: number, stepMs: number): MetricPoint[] {
  const start = now - (values.length - 1) * stepMs;
  return values.map((v, i) => ({ t: start + i * stepMs, v }));
}

function statusOf(value: number, warn: number, crit: number): MetricStatus {
  return value >= crit ? 'critical' : value >= warn ? 'warning' : 'normal';
}

function statusFor(id: MetricId, value: number): MetricStatus {
  if (id === 'load') return statusOf(value, 2.2, 3.0);
  if (id === 'net') return 'normal';
  return statusOf(value, 75, 90);
}

const SEED: Record<MetricId, { base: number; longBases?: number[] }> = {
  cpu:  { base: 30.8 },
  mem:  { base: 60.7 },
  disk: { base: 48.1 },
  swap: { base: 12.3 },
  net:  { base: 4.2,  longBases: [4.2, 1.1] },
  load: { base: 1.4,  longBases: [1.4, 1.1, 0.9] },
};

function buildInitial(now: number): Record<MetricId, MetricState> {
  const out = {} as Record<MetricId, MetricState>;
  (Object.keys(RANGES) as MetricId[]).forEach((id) => {
    const r = RANGES[id];
    const seed = SEED[id];
    const history = toSeries(walk(SHORT_POINTS, seed.base, r.amp * 1.5, r.lo, r.hi), now, TICK_MS);
    const longHistory = seed.longBases
      ? seed.longBases.map((b, i) =>
          toSeries(walk(LONG_POINTS, b, r.amp * (1 - i * 0.25), r.lo, r.hi), now, TICK_MS * 1.5))
      : [toSeries(walk(LONG_POINTS, seed.base, r.amp, r.lo, r.hi), now, TICK_MS * 1.5)];

    out[id] = {
      value: seed.base,
      history,
      longHistory,
      status: statusFor(id, seed.base),
      detail: DETAILS[id],
    };
  });
  return out;
}

function advance(prev: Record<MetricId, MetricState>, now: number): Record<MetricId, MetricState> {
  const next = {} as Record<MetricId, MetricState>;
  (Object.keys(prev) as MetricId[]).forEach((id) => {
    const cur = prev[id];
    const r = RANGES[id];
    const nv = clamp(cur.value + (Math.random() - 0.5) * r.amp, r.lo, r.hi);

    const history = [...cur.history.slice(1), { t: now, v: nv }];
    const longHistory = cur.longHistory.map((series, i) => {
      const last = series[series.length - 1].v;
      const nlv = clamp(last + (Math.random() - 0.5) * r.amp * (1 - i * 0.25), r.lo, r.hi);
      return [...series.slice(1), { t: now, v: nlv }];
    });

    next[id] = {
      value: nv,
      history,
      longHistory,
      status: statusFor(id, nv),
      detail: cur.detail,
    };
  });
  return next;
}

/** Hardcoded, self-ticking system metrics — stands in for live polling data. */
export function useMockMetrics(live: boolean) {
  const [metrics, setMetrics] = useState<Record<MetricId, MetricState>>(() => buildInitial(Date.now()));
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const iv = setInterval(() => {
      if (!liveRef.current) return;
      setMetrics((prev) => advance(prev, Date.now()));
    }, TICK_MS);
    return () => clearInterval(iv);
  }, []);

  return metrics;
}
