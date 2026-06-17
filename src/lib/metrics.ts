/** Shared metric domain types and status thresholds — used by the live
 * SSH-backed hook (`use-live-metrics`) so `Overview`'s `MetricCard` and
 * `Monitor`'s resource/chart cards consume the same data shape. */

export type MetricStatus = 'normal' | 'warning' | 'critical';
export type MetricId = 'cpu' | 'mem' | 'disk' | 'swap' | 'net' | 'load';
/** The subset of metrics the real SSH-backed monitor can sample. */
export type LiveMetricId = 'cpu' | 'mem' | 'disk' | 'swap' | 'net' | 'load';

export type MetricPoint = { t: number; v: number };

export type MetricState = {
  value: number;
  history: MetricPoint[];
  longHistory: MetricPoint[][];
  status: MetricStatus;
  detail: string | null;
};

function statusOf(value: number, warn: number, crit: number): MetricStatus {
  return value >= crit ? 'critical' : value >= warn ? 'warning' : 'normal';
}

/** Same warn/critical thresholds for every metric source — mock or live. */
export function statusFor(id: MetricId, value: number): MetricStatus {
  if (id === 'load') return statusOf(value, 2.2, 3.0);
  if (id === 'net') return 'normal';
  return statusOf(value, 75, 90);
}
