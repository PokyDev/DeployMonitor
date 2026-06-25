import { useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  scriptLogWrite,
  scriptRemoteDelete,
  scriptRemotePrepare,
  scriptRemoteRename,
  type ScriptFileEntry,
  type ScriptUploadProgress,
} from '../lib/tauri-commands';
import { useTerminalStore, waitForUnlock, runRemoteScript } from '../stores/use-terminal-store';
import { useDashboardStore } from '../stores/use-dashboard-store';
import type { useSshConnection } from './use-ssh-connection';

type Connection = ReturnType<typeof useSshConnection>;

export type ScriptActionStatus =
  | { kind: 'uploading'; id: number; path: string; percent: number }
  | { kind: 'running'; id: number; path: string }
  | { kind: 'success'; id: number; path: string; message: string }
  | { kind: 'error'; id: number; path: string; message: string };

function mapErrorCode(code: string, raw: string): string {
  switch (code) {
    case 'SCRIPT_UPLOAD_FAILED':
      return `No se pudo subir el script a la instancia: ${raw}`;
    case 'REMOTE_CHECK_FAILED':
      return `No se pudo verificar el script en la instancia: ${raw}`;
    case 'REMOTE_DELETE_FAILED':
      return `No se pudo eliminar el script de la instancia: ${raw}`;
    case 'REMOTE_RENAME_FAILED':
      return `No se pudo renombrar el script en la instancia: ${raw}`;
    case 'SCRIPT_LOG_WRITE_FAILED':
      return `No se pudo guardar el registro de ejecución: ${raw}`;
    case 'SSH_HOST_UNREACHABLE':
      return `Host inalcanzable. Verifica la IP/dominio y el puerto: ${raw}`;
    case 'SSH_TIMEOUT':
      return 'Tiempo de espera agotado al conectar con la instancia.';
    case 'SSH_AUTH_FAILED':
      return 'Autenticación rechazada por la instancia.';
    case 'SSH_CONNECTION_FAILED':
      return `Fallo en la negociación SSH: ${raw}`;
    case 'PEM_NOT_FOUND':
    case 'PEM_NOT_READABLE':
    case 'PEM_BAD_PERMISSIONS':
    case 'PEM_INVALID_KEY':
      return `Problema con la clave .pem: ${raw}`;
    default:
      return raw || 'Error desconocido';
  }
}

/**
 * Drives the full "Ejecutar" flow: gates on an active SSH session, uploads
 * the script via `script_remote_prepare` (SFTP side-channel, with live
 * progress) — the remote file is named exactly like the local one, see
 * `spec-backend.md` § "Script Remote Execution", so re-running after an edit
 * just overwrites the same remote path — then runs it on the already-open
 * interactive terminal (`runRemoteScript`, `use-terminal-store.ts`),
 * maximizing/unlocking the terminal panel first if needed.
 *
 * `status` is a single slot, not a queue — a new `executeScript` call always
 * replaces whatever is currently shown (mirrors `pendingDeletePath` in
 * `use-script-files.ts`), which is what keeps the status card from spamming.
 *
 * Once a run actually completes (not lost to a dropped SSH session),
 * `executeScript` also writes a run-history entry via `scriptLogWrite` —
 * fire-and-forget, same as `cleanupRemoteCopy`/`renameRemoteCopy` below, so a
 * failure to persist the log never changes the success/error status already
 * shown for the run itself. `logsDirectoryPath` is the user-configured
 * Historial folder (`use-script-history.ts`); an empty value just skips the
 * write — there's nowhere to put it yet.
 */
export function useScriptRemote(connection: Connection, logsDirectoryPath: string) {
  const [status, setStatus] = useState<ScriptActionStatus | null>(null);
  // Bumped on every fresh executeScript() call. The card component keys off
  // this so a re-run on the same path always mounts fresh — even if the
  // previous success/error card for that same path was still mid-exit
  // animation — instead of reusing a card instance stuck mid-collapse.
  const runIdRef = useRef(0);

  const dismissStatus = useCallback(() => setStatus(null), []);

  const executeScript = useCallback(
    async (
      script: ScriptFileEntry,
      content: string,
      dirty: boolean,
      save: () => Promise<void>,
    ) => {
      // One run at a time — ignore re-clicks while one is already in flight.
      if (status?.kind === 'uploading' || status?.kind === 'running') return;

      if (!connection.isOnline || !connection.info) {
        setStatus({
          kind: 'error',
          id: ++runIdRef.current,
          path: script.path,
          message: 'Debes conectarte a la instancia por SSH antes de ejecutar un script.',
        });
        return;
      }

      if (dirty) await save();

      const runId = ++runIdRef.current;
      setStatus({ kind: 'uploading', id: runId, path: script.path, percent: 0 });

      const { pemPath, info } = connection;

      const unlisten = await listen<ScriptUploadProgress>('script:upload-progress', (event) => {
        if (event.payload.file_name !== script.name) return;
        setStatus((current) =>
          current?.kind === 'uploading' && current.id === runId
            ? { ...current, percent: event.payload.percent }
            : current,
        );
      });

      try {
        const result = await scriptRemotePrepare(
          pemPath,
          info.user,
          info.host,
          info.port,
          content,
          script.name,
        );

        setStatus({ kind: 'running', id: runId, path: script.path });

        try {
          useDashboardStore.getState().setTerminalExpanded(true);
          const termStore = useTerminalStore.getState();
          if (termStore.locked) {
            termStore.requestUnlock();
            await waitForUnlock();
          }

          const startedAt = new Date().toISOString();
          const startedAtMs = performance.now();
          const { exitCode, output } = await runRemoteScript(result.remote_path);
          setStatus({
            kind: exitCode === 0 ? 'success' : 'error',
            id: runId,
            path: script.path,
            message:
              exitCode === 0
                ? 'Script ejecutado correctamente.'
                : `El script terminó con error (código ${exitCode}).`,
          });

          if (logsDirectoryPath) {
            const durationMs = Math.round(performance.now() - startedAtMs);
            scriptLogWrite(logsDirectoryPath, script.name, startedAt, durationMs, exitCode, output).catch(
              (logErr) => {
                const e = logErr as { code?: string; message?: string };
                console.error(
                  'No se pudo guardar el registro de ejecución:',
                  mapErrorCode(e.code ?? '', e.message ?? String(logErr)),
                );
              },
            );
          }
        } catch (runErr) {
          const message =
            runErr instanceof Error && runErr.message === 'SSH_CONNECTION_LOST'
              ? 'La sesión SSH se cerró antes de que el script terminara.'
              : 'No se pudo iniciar la ejecución del script en la terminal.';
          setStatus({ kind: 'error', id: runId, path: script.path, message });
        }
      } catch (err) {
        const e = err as { code?: string; message?: string };
        setStatus({
          kind: 'error',
          id: runId,
          path: script.path,
          message: mapErrorCode(e.code ?? '', e.message ?? String(err)),
        });
      } finally {
        unlisten();
      }
    },
    [connection, status, logsDirectoryPath],
  );

  // Best-effort remote cleanup for local script deletion. The remote file is
  // a no-op to delete if the script was never uploaded (`scriptRemoteDelete`
  // returns `false`, not an error), so this can fire unconditionally without
  // first checking whether a remote copy exists. Fire-and-forget so local
  // deletion is never held up waiting on the network. Silently a no-op while
  // disconnected, and any failure is only logged — there's no dedicated error
  // UI for this (mirrors how local-delete failures are handled in
  // `use-script-files.ts`).
  const cleanupRemoteCopy = useCallback(
    (script: ScriptFileEntry) => {
      if (!connection.isOnline || !connection.info) return;
      const { pemPath, info } = connection;

      scriptRemoteDelete(pemPath, info.user, info.host, info.port, script.name).catch((err) => {
        const e = err as { code?: string; message?: string };
        console.error(
          'No se pudo eliminar el script de la instancia:',
          mapErrorCode(e.code ?? '', e.message ?? String(err)),
        );
      });
    },
    [connection],
  );

  // Best-effort remote sync for a local rename — same "no-op if never
  // uploaded" property as cleanupRemoteCopy, so it's safe to call
  // unconditionally on every successful local rename.
  const renameRemoteCopy = useCallback(
    (oldName: string, newName: string) => {
      if (oldName === newName) return;
      if (!connection.isOnline || !connection.info) return;
      const { pemPath, info } = connection;

      scriptRemoteRename(pemPath, info.user, info.host, info.port, oldName, newName).catch(
        (err) => {
          const e = err as { code?: string; message?: string };
          console.error(
            'No se pudo renombrar el script en la instancia:',
            mapErrorCode(e.code ?? '', e.message ?? String(err)),
          );
        },
      );
    },
    [connection],
  );

  return { status, executeScript, dismissStatus, cleanupRemoteCopy, renameRemoteCopy };
}
