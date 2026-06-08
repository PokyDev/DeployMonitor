import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { extractClearScreen } from '../lib/ansi-to-html';
import { ptyStart, ptyStop, ptyWrite } from '../lib/tauri-commands';

const MAX_CHUNKS = 2000;

/** Frontend-generated system message — gold/success palette, never from the backend. */
const CLS_SUCCESS_MESSAGE = '\x1b[32m✓ CLS ejecutado correctamente\x1b[0m\r\n';

// Module-level — prevents double-registration of the pty:data listener in React StrictMode.
let _terminalListening = false;

type TerminalStore = {
  outputChunks: string[];
  isRunning: boolean;
  pendingClearSuccess: boolean;
  init: () => Promise<void>;
  appendChunk: (raw: string) => void;
  start: (cols: number, rows: number) => Promise<void>;
  write: (data: string) => Promise<void>;
  stop: () => Promise<void>;
  clearViaCls: () => Promise<void>;
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  outputChunks: [],
  isRunning: false,
  pendingClearSuccess: false,

  init: async () => {
    if (_terminalListening) return;
    _terminalListening = true;

    await listen<string>('pty:data', (event) => {
      get().appendChunk(event.payload);
    });
  },

  appendChunk: (raw) => {
    const { cleared, remainder } = extractClearScreen(raw);

    set((state) => {
      if (cleared) {
        const next = state.pendingClearSuccess
          ? [remainder, CLS_SUCCESS_MESSAGE]
          : remainder
            ? [remainder]
            : [];
        return { outputChunks: next, pendingClearSuccess: false };
      }

      const chunks = [...state.outputChunks, raw];
      return { outputChunks: chunks.slice(-MAX_CHUNKS) };
    });
  },

  start: async (cols, rows) => {
    if (get().isRunning) return;
    await ptyStart(cols, rows);
    set({ isRunning: true });
  },

  write: async (data) => {
    await ptyWrite(data);
  },

  stop: async () => {
    if (!get().isRunning) return;
    await ptyStop();
    set({ isRunning: false, outputChunks: [] });
  },

  /** Sends `cls` as if typed — it visibly echoes, runs for real, then we
   *  inject a success message once the real screen-clear is observed. */
  clearViaCls: async () => {
    set({ pendingClearSuccess: true });
    await ptyWrite('cls\r');
  },
}));
