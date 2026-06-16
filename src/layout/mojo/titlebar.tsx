import { useEffect, useRef, useState } from 'react';
import './titlebar.css';

import Semaphore from './elements/semaphore';
import Controls from './elements/controls';
import { useDashboardStore } from '../../stores/use-dashboard-store';

const HINT_EXIT_MS = 300;

interface ControlsProps {
  onThemeToggle: () => void;
}

function ConnectionHint() {
  const stage = useDashboardStore((s) => s.connectionStage);
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVerifiedRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (stage === 'verified') {
      wasVerifiedRef.current = true;
      setExiting(false);
      setMounted(true);
    } else if (wasVerifiedRef.current) {
      wasVerifiedRef.current = false;
      setExiting(true);
      timerRef.current = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, HINT_EXIT_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stage]);

  if (!mounted) return null;

  return (
    <span className={`titlebar-hint${exiting ? ' titlebar-hint--exit' : ''}`}>
      <span className="titlebar-hint__pip" aria-hidden="true" />
      Ya puedes conectarte a la instancia
    </span>
  );
}

export default function Titlebar({ onThemeToggle }: ControlsProps) {
  return (
    <nav className="titlebar" data-tauri-drag-region>
      <div className="titlebar__left">
        <Semaphore />
        <ConnectionHint />
      </div>
      <div className="titlebar__right">
        <Controls onThemeToggle={onThemeToggle} />
      </div>
    </nav>
  );
}
