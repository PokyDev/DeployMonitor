import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import { ptyResize, ptyStart, ptyStop, ptyWrite } from '../lib/tauri-commands';
import { detectSshOutput } from '../lib/ssh-utils';

// Module-level — prevents double-registration of the pty:data listener in React StrictMode.
let _terminalListening = false;

type SshCallbacks = {
  sshConnectedCb: (() => void) | null;
  sshFailedCb: (() => void) | null;
  sshExitCb: (() => void) | null;
  /** Fired when the user manually types an SSH command in the terminal. */
  sshManualDetectCb: ((cmd: string) => void) | null;
};

type TerminalStore = SshCallbacks & {
  terminal: Terminal | null;
  isRunning: boolean;
  /** True while the welcome "lock screen" is shown — pty:data is buffered, not rendered. */
  locked: boolean;
  pendingOutput: string[];

  /** True while an SSH session is active (button-triggered or manually detected). */
  sshConnected: boolean;
  /** True while waiting for pty:data patterns that confirm SSH connected/failed. */
  sshDetecting: boolean;

  /** Registered by terminal.tsx so the connect flow can trigger unlock programmatically. */
  unlockFn: (() => void) | null;
  /** Set when requestUnlock() is called before unlockFn is registered. */
  unlockPending: boolean;

  init: () => Promise<void>;
  setTerminal: (term: Terminal | null) => void;
  start: (cols: number, rows: number) => Promise<void>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  unlock: () => void;

  setSshConnected: (v: boolean) => void;
  /** Called by terminal.tsx to expose/revoke the programmatic unlock trigger. */
  registerUnlockFn: (fn: (() => void) | null) => void;
  /**
   * Triggers the terminal unlock.
   * If the unlock fn is not yet registered (terminal still expanding), sets
   * unlockPending so registerUnlockFn fires it as soon as the fn arrives.
   */
  requestUnlock: () => void;
  /** Merges provided callbacks — omitted keys are left unchanged. */
  registerSshCallbacks: (cbs: Partial<SshCallbacks>) => void;
  /** Called by terminal.tsx onData when a complete SSH command line is typed. */
  notifySshCommandTyped: (cmd: string) => void;
  startSshDetection: () => void;
  stopSshDetection: () => void;
  /** Writes a frontend-generated system message directly to xterm (not to the PTY). */
  writeSystemMessage: (text: string) => void;
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminal: null,
  isRunning: false,
  locked: true,
  pendingOutput: [],

  sshConnected: false,
  sshDetecting: false,

  unlockFn: null,
  unlockPending: false,

  sshConnectedCb: null,
  sshFailedCb: null,
  sshExitCb: null,
  sshManualDetectCb: null,

  init: async () => {
    if (_terminalListening) return;
    _terminalListening = true;

    await listen<string>('pty:data', (event) => {
      const state = get();

      if (state.locked) {
        state.pendingOutput.push(event.payload);
        return;
      }

      // SSH lifecycle detection — active after an SSH command is submitted.
      if (state.sshDetecting) {
        const signal = detectSshOutput(event.payload);
        if (signal === 'connected') {
          set({ sshDetecting: false, sshConnected: true });
          get().sshConnectedCb?.();
        } else if (signal === 'failed') {
          set({ sshDetecting: false });
          get().sshFailedCb?.();
        }
        // 'disconnected' during initial detection is ignored.
      } else if (state.sshConnected) {
        const signal = detectSshOutput(event.payload);
        if (signal === 'disconnected') {
          set({ sshConnected: false });
          get().sshExitCb?.();
        }
      }

      state.terminal?.write(event.payload);
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
    set({ isRunning: false, locked: true, pendingOutput: [] });
  },

  clear: () => {
    get().terminal?.clear();
    void ptyWrite('cls\r');
  },

  unlock: () => set({ locked: false, pendingOutput: [] }),

  setSshConnected: (v) => set({ sshConnected: v }),

  registerUnlockFn: (fn) => {
    set({ unlockFn: fn });
    // If a programmatic unlock was requested before the fn was available, fire it now.
    if (fn && get().unlockPending) {
      set({ unlockPending: false });
      fn();
    }
  },

  requestUnlock: () => {
    const fn = get().unlockFn;
    if (fn) {
      fn();
    } else {
      set({ unlockPending: true });
    }
  },

  registerSshCallbacks: (cbs) => {
    const update: Partial<SshCallbacks> = {};
    if ('sshConnectedCb' in cbs)    update.sshConnectedCb    = cbs.sshConnectedCb ?? null;
    if ('sshFailedCb' in cbs)       update.sshFailedCb       = cbs.sshFailedCb ?? null;
    if ('sshExitCb' in cbs)         update.sshExitCb         = cbs.sshExitCb ?? null;
    if ('sshManualDetectCb' in cbs) update.sshManualDetectCb = cbs.sshManualDetectCb ?? null;
    set(update);
  },

  notifySshCommandTyped: (cmd) => {
    get().sshManualDetectCb?.(cmd);
  },

  startSshDetection: () => set({ sshDetecting: true }),
  stopSshDetection:  () => set({ sshDetecting: false }),

  writeSystemMessage: (text) => {
    get().terminal?.write(text);
  },
}));
