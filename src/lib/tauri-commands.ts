import { invoke } from '@tauri-apps/api/core';

/** Starts the local PTY shell at the given terminal dimensions. No-op if already running. */
export async function ptyStart(cols: number, rows: number): Promise<void> {
  await invoke('pty_start', { cols, rows });
}

/** Sends raw input bytes (text or escape sequences) to the running local PTY. */
export async function ptyWrite(data: string): Promise<void> {
  await invoke('pty_write', { data });
}

/** Kills the local PTY shell process. */
export async function ptyStop(): Promise<void> {
  await invoke('pty_stop');
}
