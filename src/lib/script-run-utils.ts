/** Shared utilities for executing a local script file on the remote instance
 * through the already-open interactive SSH session (see use-script-runner.ts).
 * The script content is piped through base64 over stdin — it never touches
 * the remote disk (no scp/sftp, no remote temp file). */

const MARKER_PREFIX = '##DM-RUN-END-';
const MARKER_SUFFIX = '##';

// Conservative — keeps each typed line well under the ~4096-byte canonical
// tty line limit a real Linux pty enforces (DM_B64_<id>+='...' adds a small
// fixed overhead per line on top of this). Not yet validated against a real
// instance — tighten or loosen once confirmed in manual testing.
const BASE64_CHUNK_SIZE = 2000;

/** How many trailing characters of accumulated pty output callers should
 * keep across `pty:data` chunks so a marker split across two events is
 * still detected — must be at least as long as the longest possible marker. */
export const SCRIPT_RUN_CARRY_LENGTH = 256;

/** Maps a script's file extension to the remote command that reads it from
 * stdin. Returns null for unsupported types — callers must show an explicit
 * error instead of guessing. Only shell scripts are supported in this first
 * version; extend this table to add interpreters (e.g. `python3 -`, `node`). */
export function getInterpreterCommand(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'bash -s';
  return null;
}

function toBase64(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Builds the line(s) to type into the already-open interactive SSH session
 * so the script runs without ever being written to the remote disk, and the
 * remote shell reports completion via a unique end marker carrying the exit
 * code.
 *
 * Each line is independently typed (CR-terminated, same convention as the
 * existing `cd`/`ssh` injection in use-ssh-connection.ts) and kept under
 * `BASE64_CHUNK_SIZE` — a single huge line risks silent truncation by the
 * remote tty's canonical-mode line buffer. The base64 alphabet never
 * contains a single quote, so wrapping each chunk in `'...'` is always safe
 * regardless of what quoting/escaping the original script uses internally. */
export function buildScriptRunCommand(runId: string, interpreterCmd: string, content: string): string {
  const b64 = toBase64(content);
  const varName = `DM_B64_${runId}`;
  const varRef = '$' + varName;

  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += BASE64_CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + BASE64_CHUNK_SIZE));
  }

  const lines = [
    `${varName}=''`,
    ...chunks.map((chunk) => `${varName}+='${chunk}'`),
    `echo "${varRef}" | base64 -d | ${interpreterCmd}; echo "${MARKER_PREFIX}${runId}-$?${MARKER_SUFFIX}"; unset ${varName}`,
  ];

  return lines.join('\r') + '\r';
}

/** Scans accumulated `pty:data` text for the end-of-run marker belonging to
 * `runId`, returning the script's exit code if found. Callers must
 * concatenate a small carry buffer (see `SCRIPT_RUN_CARRY_LENGTH`) with each
 * new chunk before calling this — the marker can land split across two
 * separate `pty:data` events. */
export function matchScriptRunEnd(text: string, runId: string): number | null {
  const re = new RegExp(`${MARKER_PREFIX}${runId}-(\\d+)${MARKER_SUFFIX}`);
  const match = re.exec(text);
  return match ? parseInt(match[1], 10) : null;
}
