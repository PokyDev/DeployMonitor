import { useCallback, useEffect, useState } from 'react';
import { sshTestConnection } from '../lib/tauri-commands';
import {
  parseSshCommand,
  extractPemDir,
  buildSshConnectedBanner,
  SSH_DISCONNECTED_BANNER,
} from '../lib/ssh-utils';
import { useTerminalStore } from '../stores/use-terminal-store';
import { useDashboardStore } from '../stores/use-dashboard-store';

export type ConnectionStage = 'idle' | 'connecting' | 'testing' | 'online' | 'verified' | 'error';

export type ConnectionInfo = {
  host: string;
  user: string;
  latencyMs: number;
};

function mapErrorCode(code: string, raw: string): string {
  switch (code) {
    case 'PEM_NOT_FOUND':
      return `Archivo no encontrado: ${raw}`;
    case 'PEM_NOT_READABLE':
      return `El archivo .pem no se puede leer. Verifica los permisos: ${raw}`;
    case 'PEM_BAD_PERMISSIONS':
      return 'Los permisos del archivo son demasiado abiertos. SSH exige que solo el propietario tenga acceso (chmod 400).';
    case 'PEM_INVALID_KEY':
      return `El archivo no es una clave privada válida. Verifica que sea un .pem de SSH: ${raw}`;
    case 'SSH_HOST_UNREACHABLE':
      return `Host inalcanzable. Verifica la IP/dominio y que el puerto 22 esté abierto en el Security Group. (${raw})`;
    case 'SSH_TIMEOUT':
      return 'Tiempo de espera agotado (10 s). El host no respondió — puede estar apagado o el firewall bloquea el puerto 22.';
    case 'SSH_AUTH_FAILED':
      return 'Autenticación rechazada. La clave .pem no corresponde a este servidor o el usuario es incorrecto.';
    case 'SSH_CONNECTION_FAILED':
      return `Fallo en la negociación SSH: ${raw}`;
    default:
      return raw || 'Error desconocido';
  }
}

/**
 * Waits until the terminal store's `locked` field becomes false.
 * Rejects if the unlock animation doesn't complete in time.
 */
function waitForUnlock(timeoutMs = 20000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!useTerminalStore.getState().locked) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      unsub();
      reject(new Error('Terminal unlock timeout'));
    }, timeoutMs);
    const unsub = useTerminalStore.subscribe((state) => {
      if (!state.locked) {
        window.clearTimeout(timer);
        unsub();
        resolve();
      }
    });
  });
}

/** Clears all SSH callbacks and stops detection — used on logout and full reset. */
function clearSshState() {
  const termStore = useTerminalStore.getState();
  termStore.stopSshDetection();
  termStore.setSshConnected(false);
  termStore.registerSshCallbacks({
    sshConnectedCb: null,
    sshFailedCb: null,
    sshExitCb: null,
  });
}

export function useSshConnection() {
  const [stage, setStage] = useState<ConnectionStage>('idle');
  const [log, setLog]     = useState<string[]>([]);
  const [pemPath, setPemPath]                   = useState('');
  const [connectionString, setConnectionString] = useState('');
  const [info, setInfo] = useState<ConnectionInfo | null>(null);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  /**
   * Registers SSH lifecycle callbacks and starts pty:data pattern detection.
   * Shared by both the "Conectar" button flow and manual SSH detection.
   */
  const startSshFlow = useCallback((user: string, host: string) => {
    const termStore = useTerminalStore.getState();

    const onConnected = () => {
      setStage('online');
      setInfo({ host, user, latencyMs: 0 });
      setLog([]);
      termStore.writeSystemMessage(buildSshConnectedBanner(user, host));
      termStore.registerSshCallbacks({ sshConnectedCb: null, sshFailedCb: null });
    };

    const onFailed = () => {
      setStage('error');
      setLog([
        `Error: No se pudo conectar a ${host}.`,
        'Verifica la clave .pem, el usuario y que el puerto 22 esté abierto.',
      ]);
      termStore.stopSshDetection();
      termStore.setSshConnected(false);
      termStore.registerSshCallbacks({ sshConnectedCb: null, sshFailedCb: null });
    };

    const onExit = () => {
      setStage('idle');
      setLog([]);
      setInfo(null);
      termStore.writeSystemMessage(SSH_DISCONNECTED_BANNER);
      termStore.setSshConnected(false);
      termStore.registerSshCallbacks({ sshExitCb: null });
    };

    termStore.registerSshCallbacks({
      sshConnectedCb: onConnected,
      sshFailedCb: onFailed,
      sshExitCb: onExit,
    });
    termStore.startSshDetection();
  }, []);

  // Register manual-SSH detection on mount: if the user types an SSH command
  // directly in the terminal, update connection state automatically.
  useEffect(() => {
    const onManualDetect = (cmd: string) => {
      const parsed = parseSshCommand(cmd);
      if (!parsed) return;
      setStage('connecting');
      setLog([]);
      startSshFlow(parsed.user, parsed.host);
    };

    useTerminalStore.getState().registerSshCallbacks({ sshManualDetectCb: onManualDetect });

    return () => {
      useTerminalStore.getState().registerSshCallbacks({ sshManualDetectCb: null });
    };
  }, [startSshFlow]);

  /** "Conectar" button handler — validates, handles terminal state, injects SSH command. */
  const connect = useCallback(async () => {
    if (!pemPath.trim()) {
      setStage('error');
      setLog(['Error: selecciona un archivo .pem con el botón "Explorar".']);
      return;
    }
    const parsed = parseSshCommand(connectionString);
    if (!parsed) {
      setStage('error');
      setLog([
        'Formato de cadena de conexión inválido.',
        'Formato esperado: ssh -i "clave.pem" usuario@host.amazonaws.com',
      ]);
      return;
    }

    setStage('connecting');
    setLog([`Iniciando conexión a ${parsed.host}…`]);

    startSshFlow(parsed.user, parsed.host);

    const termStore = useTerminalStore.getState();
    const dashStore = useDashboardStore.getState();

    try {
      if (termStore.locked) {
        // Cases 1 & 2 — terminal is locked (minimised or expanded).
        // requestUnlock either calls handleUnlock immediately (if the fn is
        // already registered) or sets unlockPending so it fires the moment
        // terminal.tsx registers the fn after the panel expands.
        termStore.requestUnlock();
        dashStore.setTerminalExpanded(true);
        await waitForUnlock();
      } else {
        // Case 3 — already unlocked, just ensure the panel is visible.
        dashStore.setTerminalExpanded(true);
      }
    } catch {
      setStage('error');
      setLog(['Error: la terminal no respondió al desbloqueo. Intenta de nuevo.']);
      termStore.stopSshDetection();
      termStore.registerSshCallbacks({ sshConnectedCb: null, sshFailedCb: null, sshExitCb: null });
      return;
    }

    // Brief grace period — lets any residual cls output clear before we type.
    await new Promise<void>((r) => window.setTimeout(r, 150));

    const pemDir = extractPemDir(pemPath);
    await termStore.write(`cd "${pemDir}"\r`);
    await new Promise<void>((r) => window.setTimeout(r, 200));
    await termStore.write(`${connectionString}\r`);
  }, [pemPath, connectionString, startSshFlow]);

  /** "Desconectar" button handler — sends exit to the active SSH session. */
  const disconnectSsh = useCallback(async () => {
    if (!useTerminalStore.getState().sshConnected) return;
    await useTerminalStore.getState().write('exit\r');
  }, []);

  /** Full local reset — used by logout. Does not send exit to the terminal. */
  const disconnect = useCallback(() => {
    setStage('idle');
    setLog([]);
    setInfo(null);
    clearSshState();
  }, []);

  const test = useCallback(async () => {
    if (!pemPath.trim()) {
      setStage('error');
      setLog(['Error: selecciona un archivo .pem con el botón "Explorar".']);
      return;
    }

    const parsed = parseSshCommand(connectionString);
    if (!parsed) {
      setStage('error');
      setLog([
        'Formato de cadena de conexión inválido.',
        'Formato esperado: ssh -i "clave.pem" usuario@host.amazonaws.com',
      ]);
      return;
    }

    setLog([]);
    setInfo(null);
    setStage('testing');
    append(`Conectando a ${parsed.host}…`);
    append(`Autenticando como ${parsed.user}…`);

    try {
      const result = await sshTestConnection(pemPath, parsed.user, parsed.host, parsed.port);
      append('Conexión establecida exitosamente.');
      append(`Latencia: ${result.latency_ms} ms`);
      setInfo({ host: parsed.host, user: parsed.user, latencyMs: result.latency_ms });
      setStage('verified');
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const msg = mapErrorCode(e.code ?? '', e.message ?? String(err));
      append(`Error: ${msg}`);
      setStage('error');
    }
  }, [pemPath, connectionString, append]);

  const clearLog = useCallback(() => setLog([]), []);

  return {
    stage,
    log,
    info,
    pemPath,
    setPemPath,
    connectionString,
    setConnectionString,
    isOnline: stage === 'online',
    connect,
    disconnectSsh,
    disconnect,
    test,
    clearLog,
  };
}
