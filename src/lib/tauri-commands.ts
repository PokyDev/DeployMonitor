import { invoke } from '@tauri-apps/api/core';

/** Starts the local PTY shell at the given terminal dimensions. No-op if already running. */
export async function ptyStart(cols: number, rows: number): Promise<void> {
  await invoke('pty_start', { cols, rows });
}

/** Sends raw input bytes (text or escape sequences) to the running local PTY. */
export async function ptyWrite(data: string): Promise<void> {
  await invoke('pty_write', { data });
}

/** Resizes the running local PTY to match the terminal's column/row count. */
export async function ptyResize(cols: number, rows: number): Promise<void> {
  await invoke('pty_resize', { cols, rows });
}

/** Kills the local PTY shell process. */
export async function ptyStop(): Promise<void> {
  await invoke('pty_stop');
}

export type SshTestResult = {
  latency_ms: number;
};

/** Tests an SSH connection using a .pem key. Throws { code, message } on failure. */
export async function sshTestConnection(
  pemPath: string,
  user: string,
  host: string,
  port?: number,
): Promise<SshTestResult> {
  return await invoke<SshTestResult>('ssh_test_connection', {
    pemPath,
    user,
    host,
    port: port ?? null,
  });
}

export type MetricSnapshot = {
  cpu_pct: number;
  mem_used_mb: number;
  mem_total_mb: number;
  disk_used_gb: number;
  disk_total_gb: number;
  load_avg_1: number;
  load_avg_5: number;
  load_avg_15: number;
  swap_used_mb: number;
  swap_total_mb: number;
  net_rx_mbs: number;
  net_tx_mbs: number;
  uptime_secs: number;
  process_count: number;
  connection_count: number;
  temp_c: number | null;
  sampled_at: string;
};

/** Starts polling the instance for live metrics over a dedicated SSH connection
 * (independent of the interactive terminal session). No-op if already running. */
export async function monitorStart(
  pemPath: string,
  user: string,
  host: string,
  port?: number,
): Promise<void> {
  await invoke('monitor_start', {
    pemPath,
    user,
    host,
    port: port ?? null,
  });
}

/** Stops the metrics polling loop. No-op if not running. */
export async function monitorStop(): Promise<void> {
  await invoke('monitor_stop');
}

export type ScriptFileEntry = {
  name: string;
  path: string;
};

/** Lists files directly inside a directory (non-recursive). Throws { code, message } on failure. */
export async function scriptFsList(dirPath: string): Promise<ScriptFileEntry[]> {
  return await invoke<ScriptFileEntry[]>('script_fs_list', { dirPath });
}

/** Reads a file's content as UTF-8 text. Throws { code, message } on failure (e.g. binary file). */
export async function scriptFsRead(path: string): Promise<string> {
  return await invoke<string>('script_fs_read', { path });
}

/** Overwrites a file's content. Used by both manual save and autosave. */
export async function scriptFsWrite(path: string, content: string): Promise<void> {
  await invoke('script_fs_write', { path, content });
}

/** Creates a new empty file inside a directory. Throws { code, message } on failure (e.g. already exists). */
export async function scriptFsCreate(dirPath: string, fileName: string): Promise<ScriptFileEntry> {
  return await invoke<ScriptFileEntry>('script_fs_create', { dirPath, fileName });
}

/** Permanently deletes a file — no trash/confirmation. Throws { code, message } on failure. */
export async function scriptFsDelete(path: string): Promise<void> {
  await invoke('script_fs_delete', { path });
}

export type ScriptRemotePrepareResult = {
  remote_path: string;
  uploaded: boolean;
};

/** Payload of the `script:upload-progress` event emitted while `scriptRemotePrepare` is uploading. */
export type ScriptUploadProgress = {
  content_hash: string;
  percent: number;
  bytes_uploaded: number;
  total_bytes: number;
};

/**
 * Checks whether a script (identified by `contentHash`) already exists on the
 * instance and uploads it via SFTP over a one-off side-channel session if not —
 * never touches the interactive terminal. Throws { code, message } on failure
 * (e.g. SSH_HOST_UNREACHABLE, SCRIPT_UPLOAD_FAILED, REMOTE_CHECK_FAILED).
 */
export async function scriptRemotePrepare(
  pemPath: string,
  user: string,
  host: string,
  port: number | undefined,
  content: string,
  contentHash: string,
  extension: string,
): Promise<ScriptRemotePrepareResult> {
  return await invoke<ScriptRemotePrepareResult>('script_remote_prepare', {
    pemPath,
    user,
    host,
    port: port ?? null,
    content,
    contentHash,
    extension,
  });
}

/**
 * Best-effort remote cleanup, called alongside local script deletion.
 * Returns `false` (not an error) if the script was never uploaded. Throws
 * { code, message } on a real failure (e.g. SSH_HOST_UNREACHABLE, REMOTE_DELETE_FAILED).
 */
export async function scriptRemoteDelete(
  pemPath: string,
  user: string,
  host: string,
  port: number | undefined,
  contentHash: string,
  extension: string,
): Promise<boolean> {
  return await invoke<boolean>('script_remote_delete', {
    pemPath,
    user,
    host,
    port: port ?? null,
    contentHash,
    extension,
  });
}
