import { useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  scriptRemoteDelete,
  scriptRemotePrepare,
  scriptRemoteRename,
  type ScriptFileEntry,
  type ScriptUploadProgress,
} from '../lib/tauri-commands';
import type { useSshConnection } from './use-ssh-connection';

type Connection = ReturnType<typeof useSshConnection>;

export type ScriptActionStatus =
  | { kind: 'uploading'; id: number; path: string; percent: number }
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
 * Drives the SFTP upload side-channel behind "Ejecutar": gates on an active
 * SSH session, then uploads the script via `script_remote_prepare` with live
 * progress. The remote file is named exactly like the local one — see
 * `spec-backend.md` § "Script Remote Execution" — so re-running after an edit
 * just overwrites the same remote path instead of minting a new one. Sending
 * the uploaded script to the interactive terminal to actually run it is a
 * separate, not-yet-implemented step.
 *
 * `status` is a single slot, not a queue — a new `executeScript` call always
 * replaces whatever is currently shown (mirrors `pendingDeletePath` in
 * `use-script-files.ts`), which is what keeps the status card from spamming.
 */
export function useScriptRemote(connection: Connection) {
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
      // One upload at a time — ignore re-clicks while one is already in flight.
      if (status?.kind === 'uploading') return;

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

        setStatus({
          kind: 'success',
          id: runId,
          path: script.path,
          message: result.uploaded
            ? 'Script subido correctamente a la instancia.'
            : 'El script ya estaba actualizado en la instancia.',
        });
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
    [connection, status],
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
