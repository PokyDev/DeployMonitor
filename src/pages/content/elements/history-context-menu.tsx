import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

type Props = {
  x: number;
  y: number;
  label: string;
  onConfirm: () => void;
  onClose: () => void;
};

export default function HistoryContextMenu({ x, y, label, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="history-ctx-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label="Acciones de log"
    >
      <button
        type="button"
        className="history-ctx-menu__item history-ctx-menu__item--destructive"
        role="menuitem"
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
