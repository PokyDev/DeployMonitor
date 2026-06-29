import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import HistoryLogTerminal from './history-log-terminal';

type HistoryLogExpandedProps = {
  output: string;
  onClose: () => void;
};

export default function HistoryLogExpanded({ output, onClose }: HistoryLogExpandedProps) {
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose]);

  // Capture phase + stopImmediatePropagation so Escape doesn't also trigger
  // HistorySlidePanel's own keydown listener (both listen on `window`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleClose]);

  return (
    <div
      className={`history-log-expanded-overlay${closing ? ' history-log-expanded-overlay--closing' : ''}`}
      onMouseDown={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista expandida de salida de terminal"
    >
      <div
        className={`history-log-expanded-panel${closing ? ' history-log-expanded-panel--closing' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="history-log-expanded-head">
          <span className="dm-label history-log-expanded__label">Salida de terminal</span>
          <button
            type="button"
            className="dm-icon-btn history-log-expanded__close"
            onClick={handleClose}
            title="Cerrar"
            aria-label="Cerrar vista expandida"
          >
            <X size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <div className="history-log-expanded-body">
          <HistoryLogTerminal output={output} />
        </div>
      </div>
    </div>
  );
}
