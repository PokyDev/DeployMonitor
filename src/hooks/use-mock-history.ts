import { useCallback, useState } from 'react';

export type ExecutionResult = 'success' | 'failed';

export type HistoryEntry = {
  id: string;
  scriptName: string;
  triggeredBy: string;
  timestamp: string;
  duration: string;
  result: ExecutionResult;
};

export const HISTORY: HistoryEntry[] = [
  {
    id: 'exec-0192',
    scriptName: 'deploy-app.sh',
    triggeredBy: 'andres.socha',
    timestamp: '2026-06-06 03:14',
    duration: '1m 42s',
    result: 'success',
  },
  {
    id: 'exec-0191',
    scriptName: 'backup-db.py',
    triggeredBy: 'cron@scheduler',
    timestamp: '2026-06-06 00:00',
    duration: '4m 08s',
    result: 'success',
  },
  {
    id: 'exec-0190',
    scriptName: 'health-check.js',
    triggeredBy: 'andres.socha',
    timestamp: '2026-06-05 22:47',
    duration: '6s',
    result: 'success',
  },
  {
    id: 'exec-0189',
    scriptName: 'deploy-app.sh',
    triggeredBy: 'andres.socha',
    timestamp: '2026-06-05 19:03',
    duration: '0m 58s',
    result: 'failed',
  },
  {
    id: 'exec-0188',
    scriptName: 'rotate-logs.sh',
    triggeredBy: 'cron@scheduler',
    timestamp: '2026-06-05 03:00',
    duration: '2m 15s',
    result: 'success',
  },
  {
    id: 'exec-0187',
    scriptName: 'health-check.js',
    triggeredBy: 'andres.socha',
    timestamp: '2026-06-04 22:47',
    duration: '7s',
    result: 'success',
  },
];

const LOG_TEMPLATES: Record<string, string[]> = {
  'deploy-app.sh': [
    '[03:14:01] Iniciando ejecución remota…',
    '[03:14:02] ▶ Compilando proyecto…',
    '[03:14:09] ✓ vite build completado en 8.2s',
    '[03:14:10] ▶ Sincronizando artefactos con el servidor…',
    '[03:14:35] ✓ 142 archivos transferidos (3.1 MB)',
    '[03:14:36] ▶ Reiniciando servicio…',
    '[03:14:42] ✓ app.service activo (running)',
    '[03:14:43] ✔ Despliegue completado',
  ],
  'backup-db.py': [
    '[00:00:01] Generando dump de la base de datos…',
    '[00:01:48] pg_dump → /tmp/backup-20260606-000001.sql.gz (48.2 MB)',
    '[00:01:49] Subiendo a s3://deploy-monitor-backups/…',
    '[00:04:06] ✓ Transferencia completa',
    '[00:04:08] Backup subido: /tmp/backup-20260606-000001.sql.gz',
  ],
  'health-check.js': [
    '[22:47:01] 200 · 81ms · https://api.deploy-monitor.dev/health',
    '[22:47:02] 200 · 96ms · https://api.deploy-monitor.dev/status',
    '[22:47:07] Sondeo finalizado sin errores.',
  ],
  'rotate-logs.sh': [
    '[03:00:01] ▶ Comprimiendo logs con más de 14 días…',
    '[03:01:24] ✓ 9 archivos comprimidos',
    '[03:01:25] ▶ Eliminando archivos comprimidos con más de 60 días…',
    '[03:02:14] ✓ 3 archivos eliminados (212 MB liberados)',
    '[03:02:16] ✔ Rotación de logs completada',
  ],
};

const FAILURE_TAIL = [
  '[19:03:52] ▶ Reiniciando servicio…',
  '[19:03:58] ✗ systemctl: Job for app.service failed because the control process exited with error code.',
  '[19:03:58] ✗ Despliegue abortado — revertir a la versión anterior.',
];

/** Builds the log lines shown in the execution detail modal — mirrors app.jsx's buildLogs(exec). */
export function buildLogs(entry: HistoryEntry): string[] {
  const base = LOG_TEMPLATES[entry.scriptName] ?? [`[${entry.timestamp}] Ejecución de ${entry.scriptName}`];
  if (entry.result === 'failed') {
    return [...base.slice(0, 4), ...FAILURE_TAIL];
  }
  return base;
}

/** Hardcoded execution history list with on-demand log expansion for the detail view. */
export function useMockHistory() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const open = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);

  const selected = HISTORY.find((entry) => entry.id === selectedId) ?? null;
  const logs = selected ? buildLogs(selected) : [];

  return { history: HISTORY, selected, logs, open, close };
}
