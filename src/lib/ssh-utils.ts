/** Shared SSH utilities used by the connection hook and terminal input detection. */

/** Matches: ssh -i "key.pem" user@host  or  ssh -i key.pem user@host [-p port] */
export const SSH_CMD_RE =
  /^ssh\s+-i\s+"?([^"\s]+\.pem)"?\s+([\w][\w.-]*)@([\w][\w.\-]*)(?:\s+-p\s+(\d+))?/i;

export type ParsedSshCommand = {
  pemName: string;
  user: string;
  host: string;
  port?: number;
};

export function parseSshCommand(cmd: string): ParsedSshCommand | null {
  const m = SSH_CMD_RE.exec(cmd.trim());
  if (!m) return null;
  return {
    pemName: m[1],
    user: m[2],
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : undefined,
  };
}

/**
 * Client-side SSH keepalive options. Sent periodically over the SSH
 * protocol itself, so they (a) make the client notice and give up on a
 * truly dead connection within ~90s instead of hanging silently, and
 * (b) keep any intermediate NAT/firewall from reaping the TCP connection
 * for looking idle — which is the actual cause of most "disconnects after
 * a few inactive minutes" reports, since the remote sshd never sees it.
 */
export const SSH_KEEPALIVE_FLAGS = '-o ServerAliveInterval=30 -o ServerAliveCountMax=3';

/** True if a command (typed or stored) already sets its own keepalive option. */
export function hasKeepaliveFlag(cmd: string): boolean {
  return /ServerAliveInterval/i.test(cmd);
}

/**
 * Rebuilds an `ssh` command with the keepalive flags inserted before the
 * `user@host` destination — OpenSSH does not accept `-o` options after the
 * destination argument, it treats trailing tokens as a remote command.
 */
export function buildSshCommandWithKeepalive(parsed: ParsedSshCommand): string {
  const port = parsed.port ? ` -p ${parsed.port}` : '';
  return `ssh -i "${parsed.pemName}" ${SSH_KEEPALIVE_FLAGS}${port} ${parsed.user}@${parsed.host}`;
}

/**
 * Extracts the directory portion of a .pem file path,
 * normalising Windows backslashes to forward slashes.
 */
export function extractPemDir(pemPath: string): string {
  const normalized = pemPath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

const RESET = '\x1b[0m';
const GOLD  = '\x1b[33m';

/** Gold ANSI banner injected into xterm on SSH connect. Never sent to the PTY. */
export function buildSshConnectedBanner(user: string, host: string): string {
  const label = `Connected to ${user}@${host}`;
  const bar   = '─'.repeat(Math.max(0, 50 - label.length - 5));
  return `\r\n${GOLD}─── ${label} ${bar}${RESET}\r\n`;
}

/** Gold ANSI banner injected into xterm on SSH disconnect. */
export const SSH_DISCONNECTED_BANNER =
  `\r\n${GOLD}─── Session closed ────────────────────────────────${RESET}\r\n`;

const GREEN = '\x1b[32m';

/** Injected into xterm immediately after the SSH connection banner. */
export const SYNC_INIT_MSG =
  `\r\n${GOLD}─── Iniciando sincronización de scripts ───────────────${RESET}\r\n`;

/** Follows SYNC_INIT_MSG while the `script_sync` command is in flight. */
export const SYNC_PROGRESS_MSG = `${GOLD}    Sincronizando...${RESET}\r\n`;

/** Injected into xterm once `script_sync` resolves successfully. */
export function buildSyncCompleteBanner(uploaded: number, deleted: number): string {
  const detail =
    uploaded > 0 || deleted > 0
      ? ` (${uploaded} subido${uploaded !== 1 ? 's' : ''}, ${deleted} eliminado${deleted !== 1 ? 's' : ''})`
      : '';
  return `\r\n${GREEN}─── ✓ Sincronización Completada${detail} ───────────────${RESET}\r\n`;
}

/** Injected into xterm when `script_sync` throws — non-fatal, sync continues best-effort. */
export const SYNC_ERROR_MSG =
  `\r\n\x1b[31m─── ✗ Sincronización falló — los scripts remotos pueden estar desactualizados${RESET}\r\n`;

export type SshOutputSignal = 'connected' | 'failed' | 'disconnected' | null;

/**
 * Classifies a raw PTY output chunk as an SSH lifecycle event.
 * Called by the pty:data listener when SSH detection is active.
 */
export function detectSshOutput(data: string): SshOutputSignal {
  if (/Connection to .+ closed\.|logout\r?\n/.test(data)) return 'disconnected';
  if (
    /Last login:|Welcome to |\[ec2-user@|\[ubuntu@|\[centos@|\[admin@|\[root@/.test(data)
  )
    return 'connected';
  if (
    /Connection refused|Permission denied.*publickey|ssh: connect to host|Connection timed out|No route to host/.test(
      data,
    )
  )
    return 'failed';
  return null;
}

/**
 * Zero-width marker injected into the LOCAL shell's own prompt (see
 * `pty_service.rs` — `build_pwsh_setup` / `inject_prompt_unix`). Invisible
 * to the user. Its reappearance in a `pty:data` chunk means the local
 * shell has regained control of the terminal — which happens whenever the
 * SSH child process exits, for ANY reason (typed `exit`/`logout`, network
 * drop, server-side idle timeout, killed session, etc.). This is far more
 * reliable than matching the SSH client's exit text, which varies by
 * reason, OpenSSH version, and system locale.
 */
export const LOCAL_PROMPT_SENTINEL = String.fromCharCode(0x200b, 0x200c);

export function containsLocalPromptSentinel(data: string): boolean {
  return data.includes(LOCAL_PROMPT_SENTINEL);
}
