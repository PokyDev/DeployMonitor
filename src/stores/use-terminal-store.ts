import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import { ptyResize, ptyStart, ptyStop, ptyWrite } from '../lib/tauri-commands';

// Module-level — prevents double-registration of the pty:data listener in React StrictMode.
let _terminalListening = false;

type TerminalStore = {
  terminal: Terminal | null;
  isRunning: boolean;
  /** True while the welcome "lock screen" is shown — pty:data is buffered, not rendered. */
  locked: boolean;
  pendingOutput: string[];
  init: () => Promise<void>;
  setTerminal: (term: Terminal | null) => void;
  start: (cols: number, rows: number) => Promise<void>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  /** Reveals the real shell output buffered while the lock screen was shown. */
  unlock: () => void;
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminal: null,
  isRunning: false,
  locked: true,
  pendingOutput: [],

  init: async () => {
    if (_terminalListening) return;
    _terminalListening = true;

    await listen<string>('pty:data', (event) => {
      if (get().locked) {
        get().pendingOutput.push(event.payload);
        return;
      }
      get().terminal?.write(event.payload);
    });
  },

  setTerminal: (term) => set({ terminal: term }),

  start: async (cols, rows) => {
    if (get().isRunning) return;
    await ptyStart(cols, rows);
    set({ isRunning: true });
  },

  write: async (data) => {
    await ptyWrite(data);
  },

  resize: async (cols, rows) => {
    await ptyResize(cols, rows);
  },

  stop: async () => {
    if (!get().isRunning) return;
    await ptyStop();
    set({ isRunning: false });
  },

  /** Clears the xterm scrollback/screen buffer and asks the shell to redraw its prompt. */
  clear: () => {
    get().terminal?.clear();
    void ptyWrite('cls\r');
  },

  unlock: () => {
    const { terminal, pendingOutput } = get();
    if (pendingOutput.length > 0) {
      terminal?.write(pendingOutput.join(''));
    }
    set({ locked: false, pendingOutput: [] });
  },
}));
