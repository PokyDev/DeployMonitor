import { useCallback, useEffect, useRef, useState } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import {
  scriptFsCreate,
  scriptFsDelete,
  scriptFsList,
  scriptFsRead,
  scriptFsWrite,
  type ScriptFileEntry,
} from '../lib/tauri-commands';

export type { ScriptFileEntry };

// Persists only the chosen scripts directory across app restarts — mirrors
// the connection-settings.json pattern in use-ssh-connection.ts.
const scriptsStore = new LazyStore('scripts-settings.json');

const AUTOSAVE_DEBOUNCE_MS = 800;

function mapErrorCode(code: string, raw: string): string {
  switch (code) {
    case 'DIRECTORY_NOT_FOUND':
      return `El directorio no existe: ${raw}`;
    case 'DIRECTORY_NOT_READABLE':
      return `No se pudo leer el directorio: ${raw}`;
    case 'FILE_NOT_FOUND':
      return `El archivo no existe: ${raw}`;
    case 'FILE_NOT_READABLE':
      return `No se pudo leer el archivo: ${raw}`;
    case 'FILE_NOT_UTF8':
      return 'No se puede abrir este archivo en el editor (contenido binario).';
    case 'FILE_WRITE_FAILED':
      return `No se pudo guardar el archivo: ${raw}`;
    case 'FILE_ALREADY_EXISTS':
      return `Ya existe un archivo llamado "${raw}" en este directorio.`;
    case 'INVALID_FILE_NAME':
      return `Nombre de archivo inválido: ${raw}`;
    default:
      return raw || 'Error desconocido';
  }
}

function errorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  return mapErrorCode(e.code ?? '', e.message ?? String(err));
}

/** Real-disk-backed replacement for the old `useMockScripts` — a chosen
 * directory's files are the source of truth, no SQLite involved. */
export function useScriptFiles() {
  const [directoryPath, setDirectoryPathState] = useState('');

  const [files, setFiles] = useState<ScriptFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ScriptFileEntry | null>(null);
  const [content, setContentState] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [autosave, setAutosave] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);

  // Restore the persisted directory once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await scriptsStore.get<string>('directoryPath');
      if (active && saved) setDirectoryPathState(saved);
    })();
    return () => {
      active = false;
    };
  }, []);

  const refreshFiles = useCallback(async (dir: string) => {
    if (!dir) {
      setFiles([]);
      return;
    }
    setFilesLoading(true);
    setFilesError(null);
    try {
      setFiles(await scriptFsList(dir));
    } catch (err) {
      setFilesError(errorMessage(err));
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshFiles(directoryPath);
  }, [directoryPath, refreshFiles]);

  const setDirectoryPath = useCallback((value: string) => {
    setDirectoryPathState(value);
    void scriptsStore.set('directoryPath', value);
    setSelected(null);
    setContentState('');
    setDirty(false);
  }, []);

  const loadContent = useCallback(async (file: ScriptFileEntry) => {
    setContentLoading(true);
    setContentError(null);
    setDirty(false);
    try {
      setContentState(await scriptFsRead(file.path));
    } catch (err) {
      setContentError(errorMessage(err));
      setContentState('');
    } finally {
      setContentLoading(false);
    }
  }, []);

  const selectFile = useCallback(
    (path: string) => {
      const file = files.find((f) => f.path === path);
      if (!file) return;
      setSelected(file);
      void loadContent(file);
    },
    [files, loadContent],
  );

  const deselectFile = useCallback(() => {
    setSelected(null);
    setContentState('');
    setDirty(false);
  }, []);

  const setContent = useCallback((value: string) => {
    setContentState(value);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!selected) return;
    await scriptFsWrite(selected.path, content);
    setDirty(false);
  }, [selected, content]);

  // Debounced autosave — fires AUTOSAVE_DEBOUNCE_MS after the last keystroke
  // while the toggle is active and the buffer is dirty.
  useEffect(() => {
    if (!autosave || !dirty || !selected) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [autosave, dirty, content, selected, save]);

  const cancelCreate = useCallback(() => {
    setCreating(false);
    setCreateError(null);
  }, []);

  const startCreate = useCallback(() => {
    setCreateError(null);
    setCreating(true);
  }, []);

  const confirmCreate = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        cancelCreate();
        return;
      }
      try {
        const entry = await scriptFsCreate(directoryPath, trimmed);
        setCreating(false);
        setCreateError(null);
        await refreshFiles(directoryPath);
        setSelected(entry);
        setContentState('');
        setDirty(false);
      } catch (err) {
        setCreateError(errorMessage(err));
      }
    },
    [directoryPath, refreshFiles, cancelCreate],
  );

  // Confirmation is owned by the UI (DeleteConfirmCard) — this only runs the
  // actual deletion once the user has confirmed. Failures (e.g. permissions,
  // already gone) are logged rather than thrown further, since there's no
  // dedicated error UI for this action.
  const deleteFile = useCallback(
    async (path: string) => {
      setPendingDeletePath((current) => (current === path ? null : current));
      try {
        await scriptFsDelete(path);
      } catch (err) {
        console.error('No se pudo eliminar el archivo:', errorMessage(err));
        return;
      }
      if (selected?.path === path) {
        setSelected(null);
        setContentState('');
        setDirty(false);
      }
      await refreshFiles(directoryPath);
    },
    [selected, directoryPath, refreshFiles],
  );

  // Only one pending confirmation at a time — requesting another replaces it.
  const requestDelete = useCallback((path: string) => {
    setPendingDeletePath(path);
  }, []);

  const cancelPendingDelete = useCallback(() => {
    setPendingDeletePath(null);
  }, []);

  return {
    directoryPath,
    setDirectoryPath,
    files,
    filesLoading,
    filesError,
    selected,
    selectFile,
    deselectFile,
    content,
    contentLoading,
    contentError,
    setContent,
    dirty,
    autosave,
    setAutosave,
    save,
    creating,
    createError,
    startCreate,
    confirmCreate,
    cancelCreate,
    deleteFile,
    pendingDeletePath,
    requestDelete,
    cancelPendingDelete,
  };
}
