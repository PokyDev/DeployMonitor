import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { extractClearScreen, stripBlankTailLines } from '../lib/ansi-to-html';
import { ptyStart, ptyStop, ptyWrite } from '../lib/tauri-commands';

const MAX_CHUNKS = 2000;

const CLS_SUCCESS_MESSAGE =
  '\x1b[32m✓ Terminal limpia\x1b[0m\r\n' +
  '\x1b[90mPresiona cualquier tecla para continuar...\x1b[0m\r\n';

// Module-level — prevents double-registration of the pty:data listener in React StrictMode.
let _terminalListening = false;

type TerminalStore = {
  outputChunks: string[];
  isRunning: boolean;
  isLocked: boolean;
  postClear: boolean;
  init: () => Promise<void>;
  appendChunk: (raw: string) => void;
  start: (cols: number, rows: number) => Promise<void>;
  write: (data: string) => Promise<void>;
  stop: () => Promise<void>;
  clearViaCls: () => Promise<void>;
  unlock: () => Promise<void>;
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  outputChunks: [],
  isRunning: false,
  isLocked: false,
  postClear: false,

  init: async () => {
    if (_terminalListening) return;
    _terminalListening = true;

    await listen<string>('pty:data', (event) => {
      get().appendChunk(event.payload);
    });
  },

  appendChunk: (raw) => {
    const { cleared } = extractClearScreen(raw);

    set((state) => {
      if (cleared) {
        // Discard remainder (PSReadLine's post-clear prompt) — it will be
        // redrawn fresh when unlock() sends \r. Show only the lock message.
        return { outputChunks: [CLS_SUCCESS_MESSAGE], postClear: true, isLocked: true };
      }

      if (state.postClear) {
        // While locked, suppress all PTY output so PSReadLine cannot inject
        // the prompt before the user presses a key.
        if (state.isLocked) return state;

        // Strip ANSI sequences + whitespace to determine if this chunk has
        // any visible content. PSReadLine may deliver screen-fill lines
        // (\x1b[K\n repeated) in a separate chunk after the clear marker.
        const bare = raw
          .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
          .replace(/\x1b./g, '')
          .replace(/[\r\n]/g, '');
        if (!/\S/.test(bare)) {
          // Pure blank-fill chunk — discard entirely.
          return state;
        }
        // First chunk with real content: trim any blank trailing lines that
        // PSReadLine may have appended, then clear the postClear flag.
        const cleaned = stripBlankTailLines(raw);
        const chunks = [...state.outputChunks, cleaned];
        return { outputChunks: chunks.slice(-MAX_CHUNKS), postClear: false };
      }

      const chunks = [...state.outputChunks, raw];
      return { outputChunks: chunks.slice(-MAX_CHUNKS), postClear: false };
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
    set({ isRunning: false, outputChunks: [], postClear: false, isLocked: false });
  },

  clearViaCls: async () => {
    await ptyWrite('cls\r');
  },

  /** Releases the post-cls lock: discards the triggering key, sends \r to
   *  PTY so PSReadLine redraws a fresh prompt, then resumes normal input. */
  unlock: async () => {
    set({ isLocked: false });
    await ptyWrite('\r');
  },
}));
