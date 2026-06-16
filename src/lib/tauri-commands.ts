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
