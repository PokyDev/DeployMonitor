import { useEffect, useState } from 'react';
import { ArrowLeft, Braces, FileCode, FileCode2, FileTerminal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { buildLogs } from '../../../hooks/use-mock-history';
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
 * over into the sidebar it opens. */
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

/** Stays mounted once an entry has been opened the first time, so the
 * closing slide-out transition has content to animate away instead of
 * unmounting (and going blank) the instant `selected` clears to null. */
function DetailSidebar({ history }: { history: History }) {
  const { selected, close } = history;
  const [lastEntry, setLastEntry] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (selected) setLastEntry(selected);
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, close]);

  const entry = selected ?? lastEntry;
  if (!entry) return null;

  const isOpen = !!selected;
  const logs = buildLogs(entry);

  return (
    <div
      className={`history-sidebar-overlay${isOpen ? ' history-sidebar-overlay--open' : ''}`}
      onMouseDown={close}
    >
      <aside
        className={`history-sidebar${isOpen ? ' history-sidebar--open' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="history-sidebar__head">
          <button type="button" className="dm-icon-btn history-sidebar__back" onClick={close} title="Volver" aria-label="Volver">
            <ArrowLeft size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <div className="history-sidebar__title">
            <ExtensionIcon scriptName={entry.scriptName} variant="modal" />
            <span>{entry.scriptName}</span>
          </div>
        </div>
        <div className="history-sidebar__body">
          <div className="history-stat-grid">
            <div className="history-stat">
              <span className="history-stat__key">Ejecutado por</span>
              <span className="history-stat__value history-stat__value--gold">{entry.triggeredBy}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Estado</span>
              <span className="history-stat__value"><ResultBadge result={entry.result} /></span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Duración</span>
              <span className="history-stat__value">{entry.duration}</span>
            </div>
            <div className="history-stat">
              <span className="history-stat__key">Fecha</span>
              <span className="history-stat__value">{entry.timestamp}</span>
            </div>
          </div>
          <div className="dm-label" style={{ marginBottom: 8 }}>Salida de terminal</div>
          <div className="history-log-term">
            {logs.map((line, i) => (
              <div key={i} className={`history-log-term__line history-log-term__line--${classifyLine(line)}`}>{line}</div>
            ))}
          </div>
        </div>
      </aside>
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

      <DetailSidebar history={history} />
    </div>
  );
}
