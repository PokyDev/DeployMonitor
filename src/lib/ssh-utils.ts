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
