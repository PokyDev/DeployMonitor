import './titlebar.css';

import Semaphore from './elements/semaphore';
import Controls from './elements/controls';

interface ControlsProps {
  onThemeToggle: () => void;
}


export default function Titlebar({ onThemeToggle } : ControlsProps) {
  return (
    <nav className="titlebar" data-tauri-drag-region>

      <div className="titlebar__left">
        <Semaphore />
        {/*
        <span className="titlebar__title" data-tauri-drag-region>
          Active
        </span>
        */}
      </div>

      <div className="titlebar__right">
        <Controls onThemeToggle={onThemeToggle} />
      </div>

    </nav>
  );
}