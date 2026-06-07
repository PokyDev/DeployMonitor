import { useEffect } from 'react';
import { FileCode, X } from 'lucide-react';
import type { useMockHistory, ExecutionResult } from '../../../hooks/use-mock-history';
import './history.css';

type History = ReturnType<typeof useMockHistory>;

const RESULT_BADGE: Record<ExecutionResult, { variant: string; label: string }> = {
  success: { variant: 'normal', label: 'Éxito' },
  failed:  { variant: 'critical', label: 'Error' },
};

function ResultBadge({ result }: { result: ExecutionResult }) {
  const { variant, label } = RESULT_BADGE[result];
  return (
    <span className={`dm-badge dm-badge--${variant}`}>
      <span className="dm-badge__pip" aria-hidden="true" />
      {label}
    </span>
  );
}

type LogLineKind = 'prompt' | 'ok' | 'err' | 'info' | 'out';

function classifyLine(line: string): LogLineKind {
  if (/^\[\d{2}:\d{2}:\d{2}\]\s*✔/.test(line) || line.includes('✓ ')) return 'ok';
  if (line.includes('✗')) return 'err';
  if (line.includes('▶')) return 'info';
  if (line.startsWith('ubuntu@')) return 'prompt';
  return 'out';
}

function DetailModal({ history }: { history: History }) {
  const { selected, logs, close } = history;

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, close]);

  if (!selected) return null;

  return (
    <div className="history-modal-overlay" onMouseDown={close}>
      <div className="history-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="history-modal__head">
          <div className="history-modal__title">
            <span className="history-modal__title-icon">
              <FileCode size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span>{selected.scriptName}</span>
          </div>
          <button type="button" className="dm-icon-btn history-modal__close" onClick={close} title="Cerrar" aria-label="Cerrar">
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="history-modal__body">
          <div className="history-log-meta">
            <span className="history-log-meta__key">Ejecutado por</span>
            <span className="history-log-meta__value history-log-meta__value--gold">{selected.triggeredBy}</span>
            <span className="history-log-meta__key">Estado</span>
            <span className="history-log-meta__value"><ResultBadge result={selected.result} /></span>
            <span className="history-log-meta__key">Duración</span>
            <span className="history-log-meta__value">{selected.duration}</span>
            <span className="history-log-meta__key">Fecha</span>
            <span className="history-log-meta__value">{selected.timestamp}</span>
          </div>
          <div className="dm-label" style={{ marginBottom: 8 }}>Salida de terminal</div>
          <div className="history-log-term">
            {logs.map((line, i) => (
              <div key={i} className={`history-log-term__line history-log-term__line--${classifyLine(line)}`}>{line}</div>
            ))}
          </div>
        </div>
        <div className="history-modal__foot">
          <button type="button" className="dm-btn" onClick={close}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

type HistoryProps = {
  history: History;
};

export default function HistoryView({ history }: HistoryProps) {
  const { history: entries, open } = history;

  return (
    <div className="dashboard__content-inner dm-section">
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Historial de ejecuciones</div>
          <div className="dm-section-desc">{entries.length} ejecuciones registradas</div>
        </div>
      </div>

      <div className="dm-card history-table">
        <div className="history-row history-row--head">
          <span className="history-row__heading">Script</span>
          <span className="history-row__heading">Ejecutado por</span>
          <span className="history-row__heading">Estado</span>
          <span className="history-row__heading">Duración</span>
          <span className="history-row__heading">Fecha</span>
          <span />
        </div>
        {entries.map((entry) => (
          <div className="history-row" key={entry.id}>
            <span className="history-row__name">{entry.scriptName}</span>
            <span className="history-row__meta" title={entry.triggeredBy}>{entry.triggeredBy}</span>
            <span><ResultBadge result={entry.result} /></span>
            <span className="history-row__meta">{entry.duration}</span>
            <span className="history-row__time">{entry.timestamp}</span>
            <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm history-row__detail" onClick={() => open(entry.id)}>
              Ver detalle
            </button>
          </div>
        ))}
      </div>

      <DetailModal history={history} />
    </div>
  );
}
