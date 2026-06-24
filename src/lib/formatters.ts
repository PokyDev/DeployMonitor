/** Formats an RFC3339 timestamp for display — e.g. "2026-06-06T03:14:00Z" -> "2026-06-06 03:14". */
export function formatTimestamp(iso: string): string {
  const [date, time] = iso.split('T');
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

/** Formats a duration in milliseconds for display — e.g. 102000 -> "1m 42s", 6000 -> "6s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s` : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
