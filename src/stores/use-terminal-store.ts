import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import type { Terminal } from '@xterm/xterm';
import { ptyResize, ptyStart, ptyStop, ptyWrite } from '../lib/tauri-commands';
import { detectSshOutput, containsLocalPromptSentinel } from '../lib/ssh-utils';

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

  /**
   * Fired by terminal.tsx's OSC 633 handler when a `DM-DONE;<exitCode>`
   * marker is parsed out of pty:data — see `runRemoteScript` below. Single
   * slot, like the SSH callbacks: only one script run is ever in flight.
   */
  scriptDoneCb: ((exitCode: number) => void) | null;

  /** True while an SSH session is active (button-triggered or manually detected). */
  sshConnected: boolean;
  /** True while waiting for pty:data patterns that confirm SSH connected/failed. */
  sshDetecting: boolean;
  /** setTimeout id for the detection fallback timer. */
  sshDetectTimer: number | null;

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
  /** Registers/clears the one-shot script-completion callback. */
  registerScriptDoneCallback: (cb: ((exitCode: number) => void) | null) => void;
};

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminal: null,
  isRunning: false,
  locked: true,
  pendingOutput: [],
  scriptDoneCb: null,

  sshConnected: false,
  sshDetecting: false,
  sshDetectTimer: null,

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

      // SSH lifecycle detection.
      // 'connected' is checked unconditionally — not only when sshDetecting is true —
      // so passive / manually-typed SSH connections are also detected without needing
      // the keyboard-buffer path (which silently fails on tab completion and paste).
      if (!state.sshConnected) {
        const signal = detectSshOutput(event.payload);
        if (signal === 'connected') {
          const timer = get().sshDetectTimer;
          if (timer) window.clearTimeout(timer);
          set({ sshDetecting: false, sshDetectTimer: null, sshConnected: true });
          get().sshConnectedCb?.();
        } else if (state.sshDetecting && signal === 'failed') {
          // Treat failure as definitive only during active detection to avoid
          // false positives from unrelated local shell error output.
          const timer = get().sshDetectTimer;
          if (timer) window.clearTimeout(timer);
          set({ sshDetecting: false, sshDetectTimer: null });
          get().sshFailedCb?.();
        }
      } else {
        const signal = detectSshOutput(event.payload);
        // The sentinel check catches every disconnect reason the regex
        // above can't name ahead of time (idle timeout, dropped network,
        // killed remote session, ...): once the SSH child process exits,
        // the local shell underneath always redraws its own prompt next.
        if (
          signal === 'disconnected' ||
          signal === 'failed' ||
          containsLocalPromptSentinel(event.payload)
        ) {
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

  startSshDetection: () => {
    // Cancel any previous timer to avoid ghost triggers.
    const prev = get().sshDetectTimer;
    if (prev) window.clearTimeout(prev);

    // Fallback: if no failure pattern is detected within 5 s, assume connected.
    // This handles servers whose MOTD/welcome message doesn't match any known pattern.
    const timer = window.setTimeout(() => {
      if (!get().sshDetecting) return;
      set({ sshDetecting: false, sshDetectTimer: null, sshConnected: true });
      get().sshConnectedCb?.();
    }, 5000);

    set({ sshDetecting: true, sshDetectTimer: timer });
  },

  stopSshDetection: () => {
    const timer = get().sshDetectTimer;
    if (timer) window.clearTimeout(timer);
    set({ sshDetecting: false, sshDetectTimer: null });
  },

  writeSystemMessage: (text) => {
    get().terminal?.write(text);
  },

  registerScriptDoneCallback: (cb) => set({ scriptDoneCb: cb }),
}));

/**
 * Waits until the terminal store's `locked` field becomes false.
 * Rejects if the unlock animation doesn't complete in time. Shared by
 * `use-ssh-connection.ts` (the "Conectar" flow) and `use-script-remote.ts`
 * (running a script also needs the terminal unlocked and visible).
 */
export function waitForUnlock(timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!useTerminalStore.getState().locked) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      unsub();
      reject(new Error('Terminal unlock timeout'));
    }, timeoutMs);
    const unsub = useTerminalStore.subscribe((state) => {
      if (!state.locked) {
        window.clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

/**
 * Sends `bash <remotePath>` to the already-open interactive PTY, followed by
 * an invisible OSC 633 marker that reports the exit code once the script
 * finishes — see `spec-terminal.md` § "Architecture Decision: script
 * execution stays on the interactive channel". Resolves with the exit code,
 * or rejects if the SSH session drops before the marker arrives (the script
 * run is considered lost, not just slow — there is no other timeout here,
 * since a deploy script may legitimately run for a long time).
 */
export function runRemoteScript(remotePath: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const store = useTerminalStore.getState();
    if (!store.sshConnected) {
      reject(new Error('SSH_CONNECTION_LOST'));
      return;
    }

    let settled = false;
    let unsub: (() => void) | null = null;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      useTerminalStore.getState().registerScriptDoneCallback(null);
      unsub?.();
      fn();
    };

    useTerminalStore.getState().registerScriptDoneCallback((exitCode) => {
      settle(() => resolve(exitCode));
    });

    unsub = useTerminalStore.subscribe((state, prev) => {
      if (prev.sshConnected && !state.sshConnected) {
        settle(() => reject(new Error('SSH_CONNECTION_LOST')));
      }
    });

    const command = `bash ${remotePath}; printf '\\033]633;DM-DONE;%s\\007' "$?"\r`;
    void useTerminalStore.getState().write(command);
  });
}
