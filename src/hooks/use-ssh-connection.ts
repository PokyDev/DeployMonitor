import { useCallback, useEffect, useRef, useState } from 'react';
import { LazyStore } from '@tauri-apps/plugin-store';
import { sshTestConnection } from '../lib/tauri-commands';
import {
  parseSshCommand,
  extractPemDir,
  buildSshConnectedBanner,
  buildSshCommandWithKeepalive,
  hasKeepaliveFlag,
  SSH_DISCONNECTED_BANNER,
} from '../lib/ssh-utils';
import { useTerminalStore, waitForUnlock } from '../stores/use-terminal-store';
import { useDashboardStore } from '../stores/use-dashboard-store';

// Persists only the connection form fields across app restarts — the rest of
// the connection state (stage, log, info) is session-only and intentionally
// not stored here.
const connectionStore = new LazyStore('connection-settings.json');

export type ConnectionStage = 'idle' | 'connecting' | 'testing' | 'online' | 'verified' | 'error';

export type ConnectionInfo = {
  host: string;
  user: string;
  port: number;
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
  const [pemPath, setPemPathState]                   = useState('');
  const [connectionString, setConnectionStringState] = useState('');
  const [info, setInfo] = useState<ConnectionInfo | null>(null);

  // Restore the persisted connection fields once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      const [savedPemPath, savedConnectionString] = await Promise.all([
        connectionStore.get<string>('pemPath'),
        connectionStore.get<string>('connectionString'),
      ]);
      if (!active) return;
      if (savedPemPath) setPemPathState(savedPemPath);
      if (savedConnectionString) setConnectionStringState(savedConnectionString);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setPemPath = useCallback((value: string) => {
    setPemPathState(value);
    void connectionStore.set('pemPath', value);
  }, []);

  const setConnectionString = useCallback((value: string) => {
    setConnectionStringState(value);
    void connectionStore.set('connectionString', value);
  }, []);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  /**
   * Registers SSH lifecycle callbacks and starts pty:data pattern detection.
   * Shared by both the "Conectar" button flow and manual SSH detection.
   */
  const startSshFlow = useCallback((user: string, host: string, port: number) => {
    const termStore = useTerminalStore.getState();

    const onConnected = () => {
      setStage('online');
      setInfo({ host, user, port, latencyMs: 0 });
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
      startSshFlow(parsed.user, parsed.host, parsed.port ?? 22);
    };

    useTerminalStore.getState().registerSshCallbacks({ sshManualDetectCb: onManualDetect });

    return () => {
      useTerminalStore.getState().registerSshCallbacks({ sshManualDetectCb: null });
    };
  }, [startSshFlow]);

  // Subscribe to sshConnected changes in the terminal store.
  // This drives stage updates for *all* connection sources — including passive
  // connections where no sshConnectedCb was registered via startSshFlow
  // (e.g., user typed SSH with tab-completion or pasted the command, or with
  // a command that doesn't exactly match SSH_CMD_RE).
  const connectionStringRef = useRef(connectionString);
  connectionStringRef.current = connectionString;

  useEffect(() => {
    const unsub = useTerminalStore.subscribe((state, prev) => {
      if (state.sshConnected === prev.sshConnected) return;
      if (state.sshConnected) {
        setStage('online');
        setLog([]);
        // Passive detections never go through startSshFlow/onConnected, so
        // `info` would otherwise stay null forever — and without it
        // content.tsx never starts the dedicated metrics-polling connection
        // (Overview/Monitor stay stuck on "Obteniendo datos"). Fall back to
        // parsing the connection panel's own field; if a real onConnected
        // call fires right after this (regex-matched manual or button flow),
        // its precise values simply overwrite this best-effort guess.
        setInfo((prevInfo) => {
          if (prevInfo) return prevInfo;
          const parsed = parseSshCommand(connectionStringRef.current);
          return parsed ? { host: parsed.host, user: parsed.user, port: parsed.port ?? 22, latencyMs: 0 } : null;
        });
      } else {
        setStage('idle');
        setLog([]);
        setInfo(null);
      }
    });
    return unsub;
  }, []);

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

    startSshFlow(parsed.user, parsed.host, parsed.port ?? 22);

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

    // Add client-side keepalive flags so idle NAT/firewall reaping and
    // server-side idle timeouts don't silently kill the session — unless
    // the user already specified their own keepalive option.
    const sshCommand = hasKeepaliveFlag(connectionString)
      ? connectionString
      : buildSshCommandWithKeepalive(parsed);
    await termStore.write(`${sshCommand}\r`);
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
      setInfo({ host: parsed.host, user: parsed.user, port: parsed.port ?? 22, latencyMs: result.latency_ms });
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
