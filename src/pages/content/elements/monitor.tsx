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
import type { useMockMetrics, MetricStatus } from '../../../hooks/use-mock-metrics';
import { SeriesAreaChart } from '../../../lib/metric-charts';
import './monitor.css';

type Metrics = ReturnType<typeof useMockMetrics>;

const RANGES = ['30min', '1h', '6h', '24h'] as const;
type Range = (typeof RANGES)[number];

const STATUS_LABEL: Record<MetricStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
};

function StatusBadge({ status }: { status: MetricStatus }) {
  return (
    <span className={`dm-badge dm-badge--${status}`}>
      <span className="dm-badge__pip" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function KpiCard({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="dm-card monitor-kpi">
      <div className="monitor-kpi__top">
        <Icon size={15} strokeWidth={1.5} aria-hidden="true" className="monitor-kpi__icon" />
        <span className="monitor-kpi__label">{label}</span>
      </div>
      {children}
    </div>
  );
}

const RESOURCE_META: Record<string, { icon: LucideIcon; title: string }> = {
  cpu:  { icon: Cpu,         title: 'CPU' },
  mem:  { icon: MemoryStick, title: 'Memoria' },
  disk: { icon: HardDrive,   title: 'Disco' },
  swap: { icon: Server,      title: 'Swap' },
};

function ResourceChart({ id, metrics }: { id: 'cpu' | 'mem' | 'disk' | 'swap'; metrics: Metrics }) {
  const meta = RESOURCE_META[id];
  const Icon = meta.icon;
  const data = metrics[id];

  return (
    <div className="dm-card monitor-card">
      <div className="monitor-card__top">
        <span className="monitor-card__title">
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="monitor-card__label">{meta.title}</span>
          <span className="monitor-card__value">
            {data.value.toFixed(1)}<span className="monitor-card__unit">%</span>
          </span>
        </span>
        <StatusBadge status={data.status} />
      </div>
      <SeriesAreaChart series={[data.longHistory[0]]} height={150} yMax={100} />
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

type MonitorProps = {
  metrics: Metrics;
};

export default function Monitor({ metrics }: MonitorProps) {
  const [range, setRange] = useState<Range>('30min');

  const txSeries = metrics.net.longHistory[1] ?? metrics.net.longHistory[0];
  const tx = txSeries[txSeries.length - 1]?.v ?? 0;
  const temperature = Math.round(46 + metrics.cpu.value * 0.2);

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
        <KpiCard icon={Clock} label="Uptime">
          <div className="monitor-kpi__value">14d 06:32</div>
          <div className="monitor-kpi__sub">sin reinicios</div>
        </KpiCard>
        <KpiCard icon={Network} label="Red">
          <div className="monitor-kpi__dual">
            <div className="monitor-kpi__dual-item">
              <span className="monitor-kpi__dual-value">
                <ArrowDown size={13} strokeWidth={1.5} aria-hidden="true" /> {metrics.net.value.toFixed(1)}
              </span>
              <span className="monitor-kpi__dual-label">MB/s ↓</span>
            </div>
            <div className="monitor-kpi__dual-item">
              <span className="monitor-kpi__dual-value monitor-kpi__dual-value--up">{tx.toFixed(1)}</span>
              <span className="monitor-kpi__dual-label">MB/s ↑</span>
            </div>
          </div>
        </KpiCard>
        <KpiCard icon={Layers} label="Procesos">
          <div className="monitor-kpi__value">142</div>
          <div className="monitor-kpi__sub">28 conexiones</div>
        </KpiCard>
        <KpiCard icon={Thermometer} label="Temperatura">
          <div className="monitor-kpi__value">{temperature}<span className="monitor-kpi__unit">°C</span></div>
          <div className="monitor-kpi__sub">CPU package</div>
        </KpiCard>
      </div>

      <div className="monitor-group-label">Uso de recursos</div>
      <div className="monitor-resource-grid">
        <ResourceChart id="cpu" metrics={metrics} />
        <ResourceChart id="mem" metrics={metrics} />
        <ResourceChart id="disk" metrics={metrics} />
        <ResourceChart id="swap" metrics={metrics} />
      </div>

      <div className="monitor-group-label">Red y carga</div>
      <div className="dm-card monitor-card">
        <div className="monitor-card__top">
          <span className="monitor-card__title">
            <Network size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="monitor-card__label">Tráfico de red</span>
          </span>
          <ChartLegend items={[{ label: 'Entrada', color: '#D4AF37' }, { label: 'Salida', color: '#2874A6' }]} />
        </div>
        <SeriesAreaChart series={metrics.net.longHistory} height={170} yMax={10} />
      </div>

      <div className="dm-card monitor-card">
        <div className="monitor-card__top">
          <span className="monitor-card__title">
            <Gauge size={16} strokeWidth={1.5} aria-hidden="true" />
            <span className="monitor-card__label">Load Average</span>
          </span>
          <ChartLegend items={[
            { label: '1 min', color: '#D4AF37' },
            { label: '5 min', color: '#2874A6' },
            { label: '15 min', color: '#9A9A9A' },
          ]} />
        </div>
        <SeriesAreaChart series={metrics.load.longHistory} height={170} yMax={4} />
      </div>
    </div>
  );
}
