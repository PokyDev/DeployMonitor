import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Key,
  Folder,
  Edit3,
  Zap,
  LogOut,
  Wifi,
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Gauge,
  Lightbulb,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import type { useSshConnection, ConnectionStage } from '../../../hooks/use-ssh-connection';
import { useTerminalStore } from '../../../stores/use-terminal-store';
import type { useMockMetrics, MetricId, MetricState, MetricStatus } from '../../../hooks/use-mock-metrics';
import { useOverviewTips } from '../../../hooks/use-overview-tips';
import { Sparkline } from '../../../lib/metric-charts';
import './overview.css';

type Connection = ReturnType<typeof useSshConnection>;
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
  verified:   { variant: 'active',   label: 'Conexión Verificada', pulse: true },
  error:      { variant: 'critical', label: 'Error' },
};

async function pickPemFile(): Promise<string | null> {
  const result = await open({
    multiple: false,
    filters: [{ name: 'SSH Private Key', extensions: ['pem'] }],
  });
  if (typeof result === 'string') return result;
  return null;
}

const LOG_DISPLAY_MS = 3000;
const LOG_EXIT_MS    = 380;

function ConnectionPanel({ connection }: { connection: Connection }) {
  const [editingHost, setEditingHost] = useState(false);
  const [logExiting, setLogExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (
      connection.stage === 'testing' ||
      connection.stage === 'idle' ||
      connection.log.length === 0
    ) {
      setLogExiting(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      setLogExiting(true);
      timerRef.current = setTimeout(() => {
        connection.clearLog();
        setLogExiting(false);
      }, LOG_EXIT_MS);
    }, LOG_DISPLAY_MS);
  }, [connection.stage, connection.log, connection.clearLog]);

  const badge = STAGE_BADGE[connection.stage];
  const busy  = connection.stage === 'testing' || connection.stage === 'connecting';
  const flash = connection.stage === 'online';
  const sshConnected = useTerminalStore((s) => s.sshConnected);

  const handleExplore = async () => {
    const selected = await pickPemFile();
    if (selected) connection.setPemPath(selected);
  };

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
              value={connection.pemPath}
              onChange={(e) => connection.setPemPath(e.target.value)}
              placeholder="C:\Users\...\key.pem"
              spellCheck={false}
            />
            <button
              type="button"
              className="dm-btn"
              onClick={handleExplore}
              disabled={busy}
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
              className={`dm-input${!editingHost ? ' dm-input--readonly' : ''}`}
              value={connection.connectionString}
              onChange={(e) => connection.setConnectionString(e.target.value)}
              readOnly={!editingHost}
              placeholder='ssh -i "clave.pem" usuario@host.amazonaws.com'
              spellCheck={false}
            />
            <button
              type="button"
              className={`dm-icon-btn${editingHost ? ' dm-icon-btn--active' : ''}`}
              title={editingHost ? 'Bloquear edición' : 'Habilitar edición'}
              aria-pressed={editingHost}
              aria-label={editingHost ? 'Bloquear edición de cadena de conexión' : 'Habilitar edición de cadena de conexión'}
              onClick={() => setEditingHost((v) => !v)}
            >
              <Edit3 size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="overview-conn__actions">
        {sshConnected ? (
          <button
            type="button"
            className="dm-btn dm-btn--danger"
            onClick={connection.disconnectSsh}
            disabled={busy}
          >
            <LogOut size={15} strokeWidth={1.5} aria-hidden="true" />
            Desconectar
          </button>
        ) : (
          <button
            type="button"
            className="dm-btn dm-btn--primary"
            onClick={connection.connect}
            disabled={busy}
          >
            <Zap size={15} strokeWidth={1.5} aria-hidden="true" />
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
        )}
        <button
          type="button"
          className="dm-btn"
          onClick={connection.test}
          disabled={busy}
        >
          <Wifi size={15} strokeWidth={1.5} aria-hidden="true" />
          Probar conexión
        </button>
      </div>

      {connection.log.length > 0 && (
        <div
          className={`overview-conn__log${logExiting ? ' overview-conn__log--exit' : ''}`}
          role="log"
          aria-live="polite"
        >
          {connection.log.map((line, i) => (
            <div key={i} className="overview-conn__log-line">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverviewHero() {
  const [now, setNow] = useState(() => new Date());
  const tip = useOverviewTips();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="dm-card overview-hero">
      <div className="overview-hero__top">
        <div className="overview-hero__identity">
          <h1 className="overview-hero__title">Overview</h1>
          <p className="overview-hero__subtitle">
            Conéctate y revisa el consumo de tu instancia
          </p>
        </div>
        <div className="overview-hero__clock">
          <span className="overview-hero__time">{timeStr}</span>
          <span className="overview-hero__date">{dateStr}</span>
        </div>
      </div>

      <div className="overview-hero__sep" role="separator" />

      <div className="overview-hero__tip">
        <div className="overview-hero__tip-head">
          <Lightbulb size={13} strokeWidth={1.5} aria-hidden="true" />
          <span className="overview-hero__tip-label">Tip</span>
        </div>
        <p className="overview-hero__tip-text">{tip}</p>
      </div>
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
      <div className="overview-page">
        <div className="overview-top">
          <ConnectionPanel connection={connection} />
          <OverviewHero />
        </div>

        <div className="overview-bottom">
          {OVERVIEW_METRICS.map((id) => (
            <MetricCard key={id} id={id} data={metrics[id]} />
          ))}
        </div>
      </div>
    </div>
  );
}
