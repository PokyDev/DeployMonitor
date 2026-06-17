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
