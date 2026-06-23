import { useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { LazyStore } from '@tauri-apps/plugin-store';
import {
  scriptFsRead,
  scriptRemoteDelete,
  scriptRemotePrepare,
  type ScriptFileEntry,
  type ScriptUploadProgress,
} from '../lib/tauri-commands';
import type { useSshConnection } from './use-ssh-connection';

type Connection = ReturnType<typeof useSshConnection>;

export type ScriptActionStatus =
  | { kind: 'uploading'; id: number; path: string; percent: number }
  | { kind: 'success'; id: number; path: string; message: string }
  | { kind: 'error'; id: number; path: string; message: string };

/**
 * Per-local-path record of the `{contentHash, extension}` last confirmed live
 * on the remote instance. This is NOT the stateless "is it already uploaded"
 * check from `spec-backend.md` (that stays a direct remote lookup by hash) —
 * it exists purely so that uploading a *new* version of a script can clean up
 * the *previous* hash-named file instead of leaving it orphaned, since the
 * remote filename has no other link back to "which local file this was."
 * Persisted via `tauri-plugin-store` (mirrors `connection-settings.json` /
 * `scripts-settings.json`) so it survives app restarts.
 */
const remoteStateStore = new LazyStore('script-remote-state.json');

type RemoteState = { contentHash: string; extension: string };

function sameRemoteState(a: RemoteState, b: RemoteState): boolean {
  return a.contentHash === b.contentHash && a.extension === b.extension;
}

/** `script.txt` -> `.txt`; no dot -> `''`. Keeps the remote filename's
 * extension matching the local file instead of forcing `.sh` on everything. */
function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function mapErrorCode(code: string, raw: string): string {
  switch (code) {
    case 'SCRIPT_UPLOAD_FAILED':
      return `No se pudo subir el script a la instancia: ${raw}`;
    case 'REMOTE_CHECK_FAILED':
      return `No se pudo verificar el script en la instancia: ${raw}`;
    case 'REMOTE_DELETE_FAILED':
      return `No se pudo eliminar el script de la instancia: ${raw}`;
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
 * Deletes `stale` from the instance unless some OTHER tracked local path
 * still points at the exact same `{contentHash, extension}` — two different
 * scripts can legitimately have byte-identical content and thus share a
 * remote file; only delete it once nothing references it anymore.
 * Fire-and-forget from the caller's perspective — failures are only logged.
 */
async function cleanupStaleRemoteState(
  ownPath: string,
  stale: RemoteState,
  pemPath: string,
  user: string,
  host: string,
  port: number,
) {
  const entries = await remoteStateStore.entries<RemoteState>();
  const stillReferenced = entries.some(
    ([otherPath, state]) => otherPath !== ownPath && sameRemoteState(state, stale),
  );
  if (stillReferenced) return;

  try {
    await scriptRemoteDelete(pemPath, user, host, port, stale.contentHash, stale.extension);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    console.error(
      'No se pudo limpiar la versión anterior del script en la instancia:',
      mapErrorCode(e.code ?? '', e.message ?? String(err)),
    );
  }
}

/**
 * Drives the SFTP upload side-channel behind "Ejecutar": gates on an active
 * SSH session, then uploads the script via `script_remote_prepare` with live
 * progress. Sending the uploaded script to the interactive terminal to
 * actually run it is a separate, not-yet-implemented step (see
 * `spec-backend.md` § "Script Remote Execution").
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

      const hash = await sha256Hex(content);
      const extension = extensionOf(script.name);
      const newState: RemoteState = { contentHash: hash, extension };
      const { pemPath, info } = connection;

      const unlisten = await listen<ScriptUploadProgress>('script:upload-progress', (event) => {
        if (event.payload.content_hash !== hash) return;
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
          hash,
          extension,
        );

        // Record what's now live for this path, and clean up whatever hash
        // it superseded (if any, and if it actually changed) — this is what
        // keeps editing/re-running a script from leaving the previous
        // version orphaned on the instance.
        const previous = await remoteStateStore.get<RemoteState>(script.path);
        await remoteStateStore.set(script.path, newState);
        void remoteStateStore.save();
        if (previous && !sameRemoteState(previous, newState)) {
          void cleanupStaleRemoteState(
            script.path,
            previous,
            pemPath,
            info.user,
            info.host,
            info.port,
          );
        }

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

  // Best-effort remote cleanup for local script deletion. Prefers the
  // tracked remote state (no disk read needed); falls back to hashing
  // whatever's still on disk only for paths uploaded before this bookkeeping
  // existed. The actual SFTP delete is fire-and-forget so local deletion is
  // never held up waiting on the network. Silently a no-op while
  // disconnected, and any failure is only logged — there's no dedicated
  // error UI for this (mirrors how local-delete failures are handled in
  // `use-script-files.ts`).
  const cleanupRemoteCopy = useCallback(
    async (script: ScriptFileEntry) => {
      const tracked = await remoteStateStore.get<RemoteState>(script.path);
      await remoteStateStore.delete(script.path);
      void remoteStateStore.save();

      if (!connection.isOnline || !connection.info) return;
      const { pemPath, info } = connection;

      try {
        const state: RemoteState =
          tracked ?? {
            contentHash: await sha256Hex(await scriptFsRead(script.path)),
            extension: extensionOf(script.name),
          };

        // Same shared-content guard as cleanupStaleRemoteState — our own
        // entry is already gone, so any remaining match is a genuinely
        // different local file still relying on this exact remote file.
        const entries = await remoteStateStore.entries<RemoteState>();
        const stillReferenced = entries.some(
          ([otherPath, other]) => otherPath !== script.path && sameRemoteState(other, state),
        );
        if (stillReferenced) return;

        void scriptRemoteDelete(
          pemPath,
          info.user,
          info.host,
          info.port,
          state.contentHash,
          state.extension,
        ).catch((err) => {
          const e = err as { code?: string; message?: string };
          console.error(
            'No se pudo eliminar el script de la instancia:',
            mapErrorCode(e.code ?? '', e.message ?? String(err)),
          );
        });
      } catch (err) {
        console.error('No se pudo preparar la eliminación remota del script:', err);
      }
    },
    [connection],
  );

  return { status, executeScript, dismissStatus, cleanupRemoteCopy };
}
