/** Shared connection/status badge presentation — used by both Overview's
 * metric cards and Monitor's KPI/resource cards so the "no data yet" /
 * "live" / "stale" copy and styling stays identical across views instead of
 * being redefined per-component. */
import type { ConnectionStage } from '../hooks/use-ssh-connection';
import type { MetricStatus } from './metrics';

export const STATUS_LABEL: Record<MetricStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
};

export function StatusBadge({ status }: { status: MetricStatus }) {
  return (
    <span className={`dm-badge dm-badge--${status}`}>
      <span className="dm-badge__pip" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export type CardState = 'disconnected' | 'connecting' | 'live' | 'stale';

/** disconnected/connecting: no SSH session or no sample yet — nothing to plot.
 * stale: a session is live but polling has failed 3+ ticks in a row; the card
 * keeps showing the last known value so the badge is the only thing that changes. */
export function cardStateFor(stage: ConnectionStage, hasSample: boolean, hasError: boolean): CardState {
  if (stage !== 'online') return 'disconnected';
  if (hasError) return 'stale';
  if (!hasSample) return 'connecting';
  return 'live';
}

export const CARD_STATE_BADGE: Record<'disconnected' | 'connecting' | 'stale', { variant: string; label: string; pulse?: boolean }> = {
  disconnected: { variant: 'idle', label: 'Sin conexión' },
  connecting:   { variant: 'running', label: 'Obteniendo datos', pulse: true },
  stale:        { variant: 'critical', label: 'Sin actualizar' },
};

export const CARD_STATE_HINT: Record<'disconnected' | 'connecting', string> = {
  disconnected: 'Conéctate para ver métricas en vivo.',
  connecting: 'Esperando el primer muestreo…',
};

/** Renders the disconnected/connecting/stale badge for a card; renders
 * nothing for 'live' (callers show their own live-state badge, e.g.
 * `StatusBadge`, instead). */
export function CardStateBadge({ cardState }: { cardState: CardState }) {
  if (cardState === 'live') return null;
  const badge = CARD_STATE_BADGE[cardState];
  return (
    <span className={`dm-badge dm-badge--${badge.variant}`}>
      <span className={`dm-badge__pip${badge.pulse ? ' dm-badge__pip--pulse' : ''}`} aria-hidden="true" />
      {badge.label}
    </span>
  );
}
