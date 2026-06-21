import { useCallback, useRef, useState } from 'react';
import { useTerminalStore } from '../stores/use-terminal-store';
import { useDashboardStore } from '../stores/use-dashboard-store';
import { buildScriptRunCommand, getInterpreterCommand } from '../lib/script-run-utils';
import type { ScriptFileEntry } from './use-script-files';

export type ScriptRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'blocked';

export type ScriptRunResult = {
  /** Strictly increasing — lets a consumer tell two results with identical
   * content apart (so it can still re-trigger on a repeated identical
   * error), and tell whether a given result has already been shown. */
  seq: number;
  path: string;
  status: 'success' | 'failed' | 'blocked';
  exitCode: number | null;
  error: string | null;
};

// Safety net in case the end marker never arrives (script hangs, session
// drops without tripping the sshConnected watcher). Doesn't kill the remote
// process — there's no channel to do that on — it only frees up the UI.
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

/** crypto.randomUUID() ships in the Tauri webview (WebView2/WebKit) — no
 * extra dependency. Only needs to be unique within the current run, so the
 * script's own stdout can never coincidentally contain the end marker. */
function generateRunId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/**
 * Orchestrates remote script execution over the *already open* interactive
 * SSH session — the same one the "Conectar" button on Overview establishes.
 *
 * This hook never connects on its own: it mirrors how the Monitor section
 * only starts polling once `connection.isOnline` is already true (see
 * content.tsx) instead of triggering a connection itself. If no SSH session
 * is active, `run()` fails fast with an explicit message pointing back to
 * Overview — the Conectar button stays the single entry point.
 *
 * This hook instance lives in content.tsx and outlives any single page
 * (e.g. the Scripts page unmounts/remounts on every section switch), so
 * results are surfaced through `pendingResult` + `consumeResult()` rather
 * than plain state: a consumer reacts once to a new result (even if its
 * content is identical to the previous one, thanks to `seq`) and then
 * consumes it, so remounting later never re-shows an already-seen result.
 */
export function useScriptRunner() {
  const [status, setStatus] = useState<ScriptRunStatus>('idle');
  const [runningPath, setRunningPath] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<ScriptRunResult | null>(null);

  const isConnected = useTerminalStore((s) => s.sshConnected);
  // Mirrors runningPath but readable synchronously inside run() without
  // waiting for a re-render — guards against double-invocation.
  const runningPathRef = useRef<string | null>(null);
  const resultSeqRef = useRef(0);

  const finish = useCallback(
    (path: string, finalStatus: 'success' | 'failed' | 'blocked', code: number | null, message: string | null) => {
      runningPathRef.current = null;
      setRunningPath(null);
      setStatus(finalStatus);
      setExitCode(code);
      setError(message);

      resultSeqRef.current += 1;
      setPendingResult({ seq: resultSeqRef.current, path, status: finalStatus, exitCode: code, error: message });
    },
    [],
  );

  /** Called by the UI once it has captured `pendingResult` into its own
   * display state — clears it so a later remount doesn't re-show it. */
  const consumeResult = useCallback(() => setPendingResult(null), []);

  const run = useCallback(async (script: ScriptFileEntry, content: string) => {
    if (runningPathRef.current) return; // one run at a time — shared PTY/session

    const interpreterCmd = getInterpreterCommand(script.name);
    if (!interpreterCmd) {
      finish(script.path, 'blocked', null, 'Tipo de script no soportado todavía (solo .sh / .bash).');
      return;
    }

    if (!useTerminalStore.getState().sshConnected) {
      finish(script.path, 'blocked', null, 'Debes conectarte a la instancia desde Overview antes de ejecutar un script.');
      return;
    }

    runningPathRef.current = script.path;
    setRunningPath(script.path);
    setStatus('running');
    setExitCode(null);
    setError(null);

    // Phase 1 ends here: we only *show* the terminal, never connect it —
    // the session is already live or run() would have bailed out above.
    useDashboardStore.getState().setTerminalExpanded(true);

    const runId = generateRunId();
    const term = useTerminalStore.getState();
    term.registerScriptRunCallbacks({
      onEnd: (code) => {
        term.registerScriptRunCallbacks({ onEnd: null });
        if (code === null) {
          finish(script.path, 'failed', null, 'La ejecución se interrumpió (se perdió la conexión o se agotó el tiempo de espera).');
        } else {
          finish(script.path, code === 0 ? 'success' : 'failed', code, null);
        }
      },
    });
    term.startScriptRunDetection(runId, RUN_TIMEOUT_MS);

    await term.write(buildScriptRunCommand(runId, interpreterCmd, content));
  }, [finish]);

  /** Sends Ctrl+C through the same pty — propagates through the ssh client
   * to whatever's running in the foreground of the remote shell. */
  const cancel = useCallback(async () => {
    if (!runningPathRef.current) return;
    await useTerminalStore.getState().write('\x03');
  }, []);

  return {
    run,
    cancel,
    status,
    isRunning: status === 'running',
    runningPath,
    isConnected,
    exitCode,
    error,
    pendingResult,
    consumeResult,
  };
}
