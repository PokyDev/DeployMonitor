import { useState, type ReactNode } from 'react';
import {
  Network,
  Gauge,
  Clock,
  Layers,
  Thermometer,
  ArrowDown,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { useSshConnection } from '../../../hooks/use-ssh-connection';
import { useLiveMetrics } from '../../../hooks/use-live-metrics';
import { useMonitorStore } from '../../../stores/use-monitor-store';
import type { LiveMetricId, MetricPoint, MetricState } from '../../../lib/metrics';
import { SeriesAreaChart } from '../../../lib/metric-charts';
import {
  StatusBadge,
  cardStateFor,
  CardStateBadge,
  CARD_STATE_HINT,
} from '../../../lib/metric-status';
import type { CardState } from '../../../lib/metric-status';
import './monitor.css';

type Connection = ReturnType<typeof useSshConnection>;

const RANGES = ['30min', '1h', '6h', '24h'] as const;
type Range = (typeof RANGES)[number];

function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${days}d ${pad(hours)}:${pad(minutes)}`;
}

function KpiCard({
  icon: Icon, label, cardState, children,
}: { icon: LucideIcon; label: string; cardState: CardState; children: ReactNode }) {
  const isEmpty = cardState === 'disconnected' || cardState === 'connecting';

  return (
    <div className={`dm-card monitor-kpi${isEmpty ? ` monitor-kpi--${cardState}` : ''}${cardState === 'stale' ? ' monitor-kpi--stale' : ''}`}>
      <div className="monitor-kpi__top">
        <span className="monitor-kpi__top-left">
          <Icon size={15} strokeWidth={1.5} aria-hidden="true" className="monitor-kpi__icon" />
          <span className="monitor-kpi__label">{label}</span>
        </span>
        {cardState !== 'live' && <CardStateBadge cardState={cardState} />}
      </div>
      {isEmpty ? (
        <>
          <div className="monitor-kpi__value monitor-kpi__value--empty">—</div>
          <p className="monitor-kpi__hint">{CARD_STATE_HINT[cardState]}</p>
        </>
      ) : children}
    </div>
  );
}

const RESOURCE_META: Record<string, { icon: LucideIcon; title: string }> = {
  cpu:  { icon: Cpu,         title: 'CPU' },
  mem:  { icon: MemoryStick, title: 'Memoria' },
  disk: { icon: HardDrive,   title: 'Disco' },
  swap: { icon: Server,      title: 'Swap' },
};

function ResourceChart({
  id, liveMetrics, cardState,
}: {
  id: 'cpu' | 'mem' | 'disk' | 'swap';
  liveMetrics: Record<LiveMetricId, MetricState> | null;
  cardState: CardState;
}) {
  const meta = RESOURCE_META[id];
  const Icon = meta.icon;
  const isEmpty = cardState === 'disconnected' || cardState === 'connecting';
  const data = liveMetrics?.[id] ?? null;

  return (
    <div className={`dm-card monitor-card${isEmpty ? ` monitor-card--${cardState}` : ''}${cardState === 'stale' ? ' monitor-card--stale' : ''}`}>
      <div className="monitor-card__top">
        <span className="monitor-card__title">
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="monitor-card__label">{meta.title}</span>
          {data ? (
            <span className="monitor-card__value">
              {data.value.toFixed(1)}<span className="monitor-card__unit">%</span>
            </span>
          ) : (
            <span className="monitor-card__value monitor-card__value--empty">—</span>
          )}
        </span>
        {cardState === 'live' && data ? <StatusBadge status={data.status} /> : <CardStateBadge cardState={cardState} />}
      </div>
      {data ? (
        <SeriesAreaChart series={[data.longHistory[0]]} height={150} yMax={100} />
      ) : (
        <div className="monitor-card__chart-empty" style={{ height: 150 }} aria-hidden="true">
          <span className="monitor-card__chart-line" />
        </div>
      )}
    </div>
  );
}

type LegendItem = { label: string; color: string };

function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="monitor-legend">
      {items.map((item) => (
        <span key={item.label} className="monitor-legend__item">
          <span className="monitor-legend__swatch" style={{ background: item.color }} aria-hidden="true" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Shared shape for the two bottom charts (Red / Load Average): a title row
 * with either a status badge (no data yet) or a static legend (live data),
 * and either the real multi-series chart or the dashed empty placeholder. */
function ChartCard({
  icon: Icon, label, cardState, legend, series, height, yMax,
}: {
  icon: LucideIcon;
  label: string;
  cardState: CardState;
  legend: LegendItem[];
  series: MetricPoint[][] | null;
  height: number;
  yMax: number;
}) {
  const isEmpty = cardState === 'disconnected' || cardState === 'connecting';
  const showBadge = isEmpty || cardState === 'stale' || !series;

  return (
    <div className={`dm-card monitor-card${isEmpty ? ` monitor-card--${cardState}` : ''}${cardState === 'stale' ? ' monitor-card--stale' : ''}`}>
      <div className="monitor-card__top">
        <span className="monitor-card__title">
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="monitor-card__label">{label}</span>
        </span>
        {showBadge ? <CardStateBadge cardState={cardState} /> : <ChartLegend items={legend} />}
      </div>
      {series ? (
        <SeriesAreaChart series={series} height={height} yMax={yMax} />
      ) : (
        <div className="monitor-card__chart-empty" style={{ height }} aria-hidden="true">
          <span className="monitor-card__chart-line" />
        </div>
      )}
    </div>
  );
}

type MonitorProps = {
  connection: Connection;
};

export default function Monitor({ connection }: MonitorProps) {
  const [range, setRange] = useState<Range>('30min');
  const liveMetrics = useLiveMetrics();
  const latest = useMonitorStore((s) => s.latest);
  const lastError = useMonitorStore((s) => s.lastError);
  const cardState = cardStateFor(connection.stage, liveMetrics !== null, lastError !== null);

  const net = liveMetrics?.net ?? null;
  const txSeries = net?.longHistory[1];
  const rx = net?.value ?? 0;
  const tx = txSeries?.[txSeries.length - 1]?.v ?? 0;

  const tempAvailable = latest?.temp_c != null;
  const tempUnavailable = cardState !== 'disconnected' && cardState !== 'connecting' && !tempAvailable;

  return (
    <div className="dashboard__content-inner dm-section">
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Monitoreo en vivo</div>
          <div className="dm-section-desc">Estado y series históricas de la instancia</div>
        </div>
        <div className="monitor-range-tabs" role="tablist" aria-label="Rango de tiempo">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`monitor-range-tab${range === r ? ' monitor-range-tab--active' : ''}`}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="monitor-kpis">
        <KpiCard icon={Clock} label="Uptime" cardState={cardState}>
          <div className="monitor-kpi__value">{formatUptime(latest?.uptime_secs ?? 0)}</div>
          <div className="monitor-kpi__sub">sin reinicios</div>
        </KpiCard>

        <KpiCard icon={Network} label="Red" cardState={cardState}>
          <div className="monitor-kpi__dual">
            <div className="monitor-kpi__dual-item">
              <span className="monitor-kpi__dual-value">
                <ArrowDown size={13} strokeWidth={1.5} aria-hidden="true" /> {rx.toFixed(1)}
              </span>
              <span className="monitor-kpi__dual-label">MB/s ↓</span>
            </div>
            <div className="monitor-kpi__dual-item">
              <span className="monitor-kpi__dual-value monitor-kpi__dual-value--up">{tx.toFixed(1)}</span>
              <span className="monitor-kpi__dual-label">MB/s ↑</span>
            </div>
          </div>
        </KpiCard>

        <KpiCard icon={Layers} label="Procesos" cardState={cardState}>
          <div className="monitor-kpi__value">{latest?.process_count ?? 0}</div>
          <div className="monitor-kpi__sub">{latest?.connection_count ?? 0} conexiones</div>
        </KpiCard>

        <KpiCard icon={Thermometer} label="Temperatura" cardState={cardState}>
          {tempUnavailable ? (
            <>
              <div className="monitor-kpi__value monitor-kpi__value--empty">—</div>
              <p className="monitor-kpi__hint">No disponible en este host.</p>
            </>
          ) : (
            <>
              <div className="monitor-kpi__value">
                {Math.round(latest?.temp_c ?? 0)}<span className="monitor-kpi__unit">°C</span>
              </div>
              <div className="monitor-kpi__sub">CPU package</div>
            </>
          )}
        </KpiCard>
      </div>

      <div className="monitor-group-label">Uso de recursos</div>
      <div className="monitor-resource-grid">
        <ResourceChart id="cpu" liveMetrics={liveMetrics} cardState={cardState} />
        <ResourceChart id="mem" liveMetrics={liveMetrics} cardState={cardState} />
        <ResourceChart id="disk" liveMetrics={liveMetrics} cardState={cardState} />
        <ResourceChart id="swap" liveMetrics={liveMetrics} cardState={cardState} />
      </div>

      <div className="monitor-group-label">Red y carga</div>
      <ChartCard
        icon={Network}
        label="Tráfico de red"
        cardState={cardState}
        legend={[{ label: 'Entrada', color: '#D4AF37' }, { label: 'Salida', color: '#2874A6' }]}
        series={net ? net.longHistory : null}
        height={170}
        yMax={10}
      />

      <ChartCard
        icon={Gauge}
        label="Load Average"
        cardState={cardState}
        legend={[
          { label: '1 min', color: '#D4AF37' },
          { label: '5 min', color: '#2874A6' },
          { label: '15 min', color: '#9A9A9A' },
        ]}
        series={liveMetrics ? liveMetrics.load.longHistory : null}
        height={170}
        yMax={4}
      />
    </div>
  );
}
