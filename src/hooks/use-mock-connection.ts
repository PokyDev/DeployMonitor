import { useCallback, useRef, useState } from 'react';

export type ConnectionStage = 'idle' | 'connecting' | 'testing' | 'online' | 'error';

export type ConnectionInfo = {
  host: string;
  user: string;
  pemName: string;
  os: string;
  uptime: string;
  region: string;
};

const MOCK_INFO: ConnectionInfo = {
  host: '54.211.98.42',
  user: 'ubuntu',
  pemName: 'deploy-monitor-key.pem',
  os: 'Ubuntu 22.04.3 LTS',
  uptime: '14d 6h 32m',
  region: 'us-east-1',
};

const STEP_MS = 650;

/** Hardcoded SSH connection lifecycle — mirrors app.jsx's onConnect/onTest setTimeout sequences. */
export function useMockConnection() {
  const [stage, setStage] = useState<ConnectionStage>('idle');
  const [log, setLog] = useState<string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  const schedule = useCallback((delay: number, fn: () => void) => {
    const id = setTimeout(fn, delay);
    timers.current.push(id);
  }, []);

  const connect = useCallback(() => {
    clearTimers();
    setLog([]);
    setStage('connecting');
    append(`Conectando a ${MOCK_INFO.host}…`);
    schedule(STEP_MS, () => append('Verificando huella del host…'));
    schedule(STEP_MS * 2, () => append(`Autenticando como ${MOCK_INFO.user} con ${MOCK_INFO.pemName}`));
    schedule(STEP_MS * 3, () => {
      append('Sesión SSH establecida.');
      setStage('online');
    });
  }, [append, clearTimers, schedule]);

  const test = useCallback(() => {
    clearTimers();
    setStage('testing');
    append('Ejecutando prueba de conexión…');
    schedule(STEP_MS, () => append('Latencia: 38ms · Paquetes: 0% pérdida'));
    schedule(STEP_MS * 2, () => {
      append('Prueba completada con éxito.');
      setStage('online');
    });
  }, [append, clearTimers, schedule]);

  const disconnect = useCallback(() => {
    clearTimers();
    setStage('idle');
    setLog([]);
  }, [clearTimers]);

  return {
    stage,
    log,
    info: MOCK_INFO,
    isOnline: stage === 'online',
    connect,
    test,
    disconnect,
  };
}
