import { useEffect } from 'react';
import type { ReactNode } from 'react';

type HistorySlidePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
};

/** Right-side overlay + slide-in panel shell shared by the execution detail
 * view and the mobile filter drawer — same backdrop, transform and
 * Escape/click-outside handling either way, only the content differs. */
export default function HistorySlidePanel({ isOpen, onClose, ariaLabel, children }: HistorySlidePanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <div
      className={`history-sidebar-overlay${isOpen ? ' history-sidebar-overlay--open' : ''}`}
      onMouseDown={onClose}
    >
      <aside
        className={`history-sidebar${isOpen ? ' history-sidebar--open' : ''}`}
        aria-label={ariaLabel}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>
  );
}
