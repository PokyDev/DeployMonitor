import { useEffect } from 'react';
import { Braces, FileCode, FileCode2, FileTerminal, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { useMockHistory, ExecutionResult, HistoryEntry } from '../../../hooks/use-mock-history';
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

/** Icon + color identity per script extension — mock data only has sh/py/js,
 * but any other extension still renders a neutral fallback chip. */
type ExtensionKey = 'sh' | 'py' | 'js' | 'default';

const EXTENSION_STYLE: Record<ExtensionKey, { icon: LucideIcon; tone: string }> = {
  sh:      { icon: FileTerminal, tone: 'sh' },
  py:      { icon: FileCode2,    tone: 'py' },
  js:      { icon: Braces,       tone: 'js' },
  default: { icon: FileCode,     tone: 'default' },
};

function getExtensionKey(scriptName: string): ExtensionKey {
  const ext = scriptName.split('.').pop()?.toLowerCase();
  return ext === 'sh' || ext === 'py' || ext === 'js' ? ext : 'default';
}

/** Same icon/color identity rendered at two sizes — `card` on the grid tile,
 * `modal` (smaller chip) in the detail header — so a card visually carries
 * over into the modal it opens. */
function ExtensionIcon({ scriptName, variant = 'card' }: { scriptName: string; variant?: 'card' | 'modal' }) {
  const { icon: Icon, tone } = EXTENSION_STYLE[getExtensionKey(scriptName)];
  return (
    <span className={`history-ext-icon history-ext-icon--${variant} history-ext-icon--${tone}`}>
      <Icon size={variant === 'modal' ? 15 : 17} strokeWidth={1.5} aria-hidden="true" />
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
            <ExtensionIcon scriptName={selected.scriptName} variant="modal" />
            <span>{selected.scriptName}</span>
          </div>
          <button type="button" className="dm-icon-btn history-modal__close" onClick={close} title="Cerrar" aria-label="Cerrar">
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="history-modal__body">
          <div className="history-stat-grid">
            <div className="history-stat">
              <span className="history-stat__key">Ejecutado por</span>
              <span className="history-stat__value history-stat__value--gold">{selected.triggeredBy}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Estado</span>
              <span className="history-stat__value"><ResultBadge result={selected.result} /></span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Duración</span>
              <span className="history-stat__value">{selected.duration}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Fecha</span>
              <span className="history-stat__value">{selected.timestamp}</span>
            </div>
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

function HistoryCard({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="history-card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="history-card__head">
        <ExtensionIcon scriptName={entry.scriptName} />
        <span className="history-card__name" title={entry.scriptName}>{entry.scriptName}</span>
      </div>
      <div className="history-card__foot">
        <span className="history-card__date">{entry.timestamp}</span>
        <ResultBadge result={entry.result} />
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

      <div className="history-grid">
        {entries.map((entry) => (
          <HistoryCard key={entry.id} entry={entry} onOpen={() => open(entry.id)} />
        ))}
      </div>

      <DetailModal history={history} />
    </div>
  );
}
