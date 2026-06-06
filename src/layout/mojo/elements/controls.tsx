import { getCurrentWindow } from '@tauri-apps/api/window';
import './controls.css';

const appWindow = getCurrentWindow();

interface ControlsProps {
  onThemeToggle: () => void;
}

export default function Controls({ onThemeToggle } : ControlsProps) {
  return (
    <div className="controls">
      {/* Theme toggle */}
      <button
        className="controls__btn controls__btn--theme"
        title="Cambiar tema"
        aria-label="Cambiar tema claro / oscuro"
        onClick={onThemeToggle}
      >
        <svg
          className="controls__theme-icon controls__theme-icon--sun"
          width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
        >
          <circle cx="8" cy="8" r="3.5" fill="currentColor" />
          <line x1="8" y1="0.5" x2="8" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="13" x2="8" y2="15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="0.5" y1="8" x2="3" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="13" y1="8" x2="15.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2.7" y1="2.7" x2="4.5" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11.5" y1="11.5" x2="13.3" y2="13.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2.7" y1="13.3" x2="4.5" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11.5" y1="4.5" x2="13.3" y2="2.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <svg
          className="controls__theme-icon controls__theme-icon--moon"
          width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"
        >
          <defs>
            <mask id="moon-mask">
              <rect width="16" height="16" fill="white" />
              <circle cx="12" cy="4.5" r="5" fill="black" />
            </mask>
          </defs>
          <circle cx="8" cy="8" r="6" fill="currentColor" mask="url(#moon-mask)" />
        </svg>
      </button>

      {/* Minimize */}
      <button
        className="controls__btn controls__btn--minimize"
        onClick={() => appWindow.minimize()}
        title="Minimizar"
        aria-label="Minimizar"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" aria-hidden="true">
          <rect width="10" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
      </button>

      {/* Maximize */}
      <button
        className="controls__btn controls__btn--maximize"
        onClick={() => appWindow.toggleMaximize()}
        title="Maximizar"
        aria-label="Maximizar"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect
            x="1" y="1" width="8" height="8" rx="1"
            fill="none" stroke="currentColor" strokeWidth="1.5"
          />
        </svg>
      </button>

      {/* Close */}
      <button
        className="controls__btn controls__btn--close"
        onClick={() => appWindow.close()}
        title="Cerrar"
        aria-label="Cerrar"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}