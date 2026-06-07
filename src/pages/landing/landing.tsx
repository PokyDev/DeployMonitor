import React, { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Terminal,
  Activity,
  FolderOpen,
  Settings,
  CornerDownLeft,
} from 'lucide-react';
import { useNavStore } from '../../stores/use-nav-store';
import './landing.css';

type Shortcut = {
  icon: LucideIcon;
  label: string;
  keys: string[];
};

const SHORTCUTS: Shortcut[] = [
  { icon: Terminal, label: 'Conectar instancia', keys: ['Ctrl', 'Shift', 'C'] },
  { icon: Activity, label: 'Monitoreo en vivo', keys: ['Ctrl', 'M'] },
  { icon: FolderOpen, label: 'Ejecutar script', keys: ['Ctrl', 'Enter'] },
  { icon: Settings, label: 'Configuración', keys: ['Ctrl', ','] },
];

function ShortcutCard({ icon: Icon, label, keys, onActivate }: Shortcut & { onActivate: () => void }) {
  return (
    <button className="landing__shortcut-card" onClick={onActivate} aria-label={`${label} — acceder al dashboard`}>
      <div className="landing__shortcut-row">
        <span className="landing__shortcut-label">{label}</span>
        <Icon className="landing__shortcut-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <div className="landing__shortcut-keys">
        {keys.map((key, i) => (
          <React.Fragment key={key}>
            <kbd className="kbd">{key}</kbd>
            {i < keys.length - 1 && <span className="kbd-sep">+</span>}
          </React.Fragment>
        ))}
        <kbd className="kbd kbd-enter" aria-hidden="true">
          <CornerDownLeft size={11} strokeWidth={1.5} />
        </kbd>
      </div>
    </button>
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
      <div className="landing__grid" aria-hidden="true" />
      <div className="landing__content">
        <span className="landing__logo-glow" aria-hidden="true" />
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
          <span className="landing__tagline-quote">“</span>
          Monitorea y automatiza tus instancias en tiempo real
          <span className="landing__tagline-quote">”</span>
        </p>
        <div className="landing__divider" aria-hidden="true" />
        <div className="landing__shortcuts" role="list" aria-label="Atajos de teclado disponibles">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} role="listitem">
              <ShortcutCard {...shortcut} onActivate={goToDashboard} />
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
