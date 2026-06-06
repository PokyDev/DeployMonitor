import React, { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Terminal,
  Activity,
  FolderOpen,
  Settings,
  CornerDownLeft,
} from 'lucide-react';
import { useSlideMessage } from '@poky-dev/slide-message';
import { useNavStore } from '../../stores/use-nav-store';
import './landing.css';

type Shortcut = {
  icon: LucideIcon;
  label: string;
  keys: string[];
};

const SHORTCUTS: Shortcut[] = [
  { icon: Terminal,   label: 'Conectar instancia', keys: ['Ctrl', 'Shift', 'C'] },
  { icon: Activity,   label: 'Monitoreo en vivo',  keys: ['Ctrl', 'M'] },
  { icon: FolderOpen, label: 'Ejecutar script',    keys: ['Ctrl', 'Enter'] },
  { icon: Settings,   label: 'Configuración',      keys: ['Ctrl', ','] },
];

function MeshBackground() {
  const cols = 22;
  const rows = 14;
  const dotSize = 1.2;
  const gapX = 700 / (cols - 1);
  const gapY = 600 / (rows - 1);

  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(
        <circle key={`${r}-${c}`} cx={c * gapX} cy={r * gapY} r={dotSize} fill="currentColor" />
      );
    }
  }

  return (
    <svg
      className="landing__mesh"
      viewBox="0 0 700 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      style={{ color: 'var(--border-default)' }}
    >
      {dots}
    </svg>
  );
}

function ShortcutCard({ icon: Icon, label, keys }: Shortcut) {
  const { notify } = useSlideMessage();
  return (
    <div className="landing__shortcut-card">
      <div className="landing__shortcut-row">
        <span className="landing__shortcut-label">{label}</span>
        <Icon className="landing__shortcut-icon" size={14} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="landing__shortcut-row">
        <div className="landing__shortcut-keys">
          {keys.map((key, i) => (
            <React.Fragment key={key}>
              <kbd className="kbd">{key}</kbd>
              {i < keys.length - 1 && <span className="kbd-sep">+</span>}
            </React.Fragment>
          ))}
        </div>
        <button
          className="landing__shortcut-run"
          onClick={() => notify({ position: 'top-left', offsetY: 56 })}
          title="Ejecutar"
          aria-label={`Ejecutar ${label}`}
        >
          <CornerDownLeft size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export default function Landing() {
  const goToDashboard = useNavStore((s) => s.goToDashboard);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') goToDashboard();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToDashboard]);

  return (
    <div className="landing" role="main">
      <MeshBackground />
      <div className="landing__content">
        <img
          src="/icon/ssh-manager-icon.png"
          alt="DeployMonitor mascota — pato coronado"
          className="landing__logo"
          draggable={false}
        />
        <h1 className="landing__name">
          Deploy<span className="landing__name-accent">Monitor</span>
        </h1>
        <p className="landing__tagline">
          <span className="landing__tagline-quote">"</span>
          Monitorea y automatiza tus instancias en tiempo real
          <span className="landing__tagline-quote">"</span>
        </p>
        <div className="landing__divider" aria-hidden="true" />
        <div className="landing__shortcuts" role="list" aria-label="Atajos de teclado disponibles">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} role="listitem">
              <ShortcutCard {...shortcut} />
            </div>
          ))}
        </div>
        <button className="landing__hint" onClick={goToDashboard} aria-label="Acceder al dashboard">
          USA ENTER PARA ACCEDER AL DASHBOARD
        </button>
      </div>
    </div>
  );
}
