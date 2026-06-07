import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Key,
  Folder,
  Edit3,
  Zap,
  Wifi,
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Gauge,
} from 'lucide-react';
import type { useMockConnection, ConnectionStage } from '../../../hooks/use-mock-connection';
import type { useMockMetrics, MetricId, MetricState, MetricStatus } from '../../../hooks/use-mock-metrics';
import { Sparkline } from '../../../lib/metric-charts';
import './overview.css';

type Connection = ReturnType<typeof useMockConnection>;
type Metrics = ReturnType<typeof useMockMetrics>;

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

const STAGE_BADGE: Record<ConnectionStage, { variant: string; label: string; pulse?: boolean }> = {
  idle:       { variant: 'idle',     label: 'Sin verificar' },
  connecting: { variant: 'running',  label: 'Conectando' },
  testing:    { variant: 'running',  label: 'Verificando' },
  online:     { variant: 'active',   label: 'Conectado', pulse: true },
  error:      { variant: 'critical', label: 'Error' },
};

function ConnectionPanel({ connection }: { connection: Connection }) {
  const [pemPath, setPemPath] = useState(`C:\\Users\\Andre\\Desktop\\DeployMonitor\\Auth\\${connection.info.pemName}`);
  const [hostString, setHostString] = useState(`${connection.info.user}@${connection.info.host}`);
  const [editingHost, setEditingHost] = useState(false);

  const badge = STAGE_BADGE[connection.stage];
  const busy = connection.stage === 'connecting' || connection.stage === 'testing';
  const flash = connection.stage === 'online';

  return (
    <div className={`dm-card overview-conn${flash ? ' overview-conn--flash' : ''}`}>
      <div className="overview-conn__head">
        <span className="dm-eyebrow">
          <Key size={16} strokeWidth={1.5} aria-hidden="true" />
          Conexión SSH
        </span>
        <span className={`dm-badge dm-badge--${badge.variant}`}>
          <span className={`dm-badge__pip${badge.pulse ? ' dm-badge__pip--pulse' : ''}`} aria-hidden="true" />
          {badge.label}
        </span>
      </div>

      <div className="overview-conn__fields">
        <div className="overview-conn__field">
          <span className="dm-label">Clave privada (.pem)</span>
          <div className="dm-input-row">
            <input
              className="dm-input"
              value={pemPath}
              onChange={(e) => setPemPath(e.target.value)}
              placeholder="C:\Users\...\key.pem"
              spellCheck={false}
            />
            <button
              type="button"
              className="dm-btn"
              onClick={() => setPemPath(`C:\\Users\\Andre\\Desktop\\DeployMonitor\\Auth\\${connection.info.pemName}`)}
            >
              <Folder size={15} strokeWidth={1.5} aria-hidden="true" />
              Explorar
            </button>
          </div>
        </div>

        <div className="overview-conn__field">
          <span className="dm-label">Cadena de conexión</span>
          <div className="dm-input-row">
            <input
              className="dm-input"
              value={hostString}
              onChange={(e) => setHostString(e.target.value)}
              readOnly={!editingHost}
              placeholder="usuario@host"
              spellCheck={false}
            />
            <button
              type="button"
              className="dm-icon-btn"
              title="Editar"
              aria-pressed={editingHost}
              aria-label={editingHost ? 'Bloquear edición de host' : 'Editar host'}
              onClick={() => setEditingHost((v) => !v)}
            >
              <Edit3 size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="overview-conn__actions">
        <button type="button" className="dm-btn dm-btn--primary" onClick={connection.connect} disabled={busy}>
          <Zap size={15} strokeWidth={1.5} aria-hidden="true" />
          {connection.isOnline ? 'Reconectar' : 'Conectar'}
        </button>
        <button type="button" className="dm-btn" onClick={connection.test} disabled={busy}>
          <Wifi size={15} strokeWidth={1.5} aria-hidden="true" />
          Probar conexión
        </button>
      </div>

      {connection.log.length > 0 && (
        <div className="overview-conn__log" role="log" aria-live="polite">
          {connection.log.map((line, i) => (
            <div key={i} className="overview-conn__log-line">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const METRIC_META: Record<MetricId, { icon: LucideIcon; label: string; unit: string }> = {
  cpu:  { icon: Cpu,         label: 'CPU',      unit: '%' },
  mem:  { icon: MemoryStick, label: 'Memoria',  unit: '%' },
  disk: { icon: HardDrive,   label: 'Disco',    unit: '%' },
  load: { icon: Gauge,       label: 'Load Avg', unit: '' },
  swap: { icon: HardDrive,   label: 'Swap',     unit: '%' },
  net:  { icon: Activity,    label: 'Red',      unit: '' },
};

const OVERVIEW_METRICS: MetricId[] = ['cpu', 'mem', 'disk', 'load'];

function MetricCard({ id, data }: { id: MetricId; data: MetricState }) {
  const meta = METRIC_META[id];
  const Icon = meta.icon;
  const value = id === 'load' ? data.value.toFixed(2) : data.value.toFixed(1);
  const percent = id === 'load' ? Math.min((data.value / 4) * 100, 100) : data.value;

  return (
    <div className="dm-card overview-metric">
      <div className="overview-metric__top">
        <span className="overview-metric__label">
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          <span>{meta.label}</span>
        </span>
        <StatusBadge status={data.status} />
      </div>
      <div className="overview-metric__value-row">
        <div className="overview-metric__value">
          {value}
          {meta.unit && <span className="overview-metric__unit">{meta.unit}</span>}
        </div>
        {data.detail && <div className="overview-metric__detail">{data.detail}</div>}
      </div>
      <div className="overview-metric__chart">
        <Sparkline data={data.history} height={56} />
      </div>
      <div className="overview-metric__bar">
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

type OverviewProps = {
  connection: Connection;
  metrics: Metrics;
};

export default function Overview({ connection, metrics }: OverviewProps) {
  return (
    <div className="dashboard__content-inner dm-section">
      <ConnectionPanel connection={connection} />

      <div className="overview-metrics">
        <div className="overview-metrics__head">
          <span className="dm-eyebrow">
            <Activity size={15} strokeWidth={1.5} aria-hidden="true" />
            Métricas del sistema
          </span>
          <span className="overview-metrics__sub">datos de muestra</span>
        </div>
        <div className="overview-metrics__grid">
          {OVERVIEW_METRICS.map((id) => (
            <MetricCard key={id} id={id} data={metrics[id]} />
          ))}
        </div>
      </div>
    </div>
  );
}
