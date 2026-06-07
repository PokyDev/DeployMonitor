import { useCallback, useRef, useState } from 'react';

export type ScriptLang = 'bash' | 'python' | 'node';

export type ScriptDef = {
  id: string;
  name: string;
  description: string;
  lang: ScriptLang;
  path: string;
  source: string;
};

export type RunStatus = 'idle' | 'running' | 'success' | 'failed';

export const SCRIPTS: ScriptDef[] = [
  {
    id: 'deploy-app',
    name: 'deploy-app.sh',
    description: 'Build, sube y reinicia el servicio principal en producción.',
    lang: 'bash',
    path: '/scripts/deploy-app.sh',
    source: `#!/usr/bin/env bash
set -euo pipefail

echo "▶ Compilando proyecto…"
pnpm build

echo "▶ Sincronizando artefactos con el servidor…"
rsync -az --delete ./dist/ deploy@\${HOST}:/var/www/app/

echo "▶ Reiniciando servicio…"
ssh deploy@\${HOST} "sudo systemctl restart app.service"

echo "✔ Despliegue completado"`,
  },
  {
    id: 'backup-db',
    name: 'backup-db.py',
    description: 'Genera un dump comprimido de la base de datos y lo sube a S3.',
    lang: 'python',
    path: '/scripts/backup-db.py',
    source: `#!/usr/bin/env python3
import datetime
import subprocess

stamp = datetime.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
dump_path = f"/tmp/backup-{stamp}.sql.gz"

subprocess.run(
    f"pg_dump $DATABASE_URL | gzip > {dump_path}",
    shell=True, check=True,
)
subprocess.run(
    f"aws s3 cp {dump_path} s3://deploy-monitor-backups/",
    shell=True, check=True,
)

print(f"Backup subido: {dump_path}")`,
  },
  {
    id: 'health-check',
    name: 'health-check.js',
    description: 'Sondea los endpoints críticos y reporta latencias.',
    lang: 'node',
    path: '/scripts/health-check.js',
    source: `import { setTimeout as sleep } from 'node:timers/promises';

const ENDPOINTS = [
  'https://api.deploy-monitor.dev/health',
  'https://api.deploy-monitor.dev/status',
];

for (const url of ENDPOINTS) {
  const start = Date.now();
  const res = await fetch(url);
  const ms = Date.now() - start;
  console.log(\`\${res.status} · \${ms}ms · \${url}\`);
  await sleep(250);
}`,
  },
  {
    id: 'rotate-logs',
    name: 'rotate-logs.sh',
    description: 'Comprime logs antiguos y limpia espacio en disco.',
    lang: 'bash',
    path: '/scripts/rotate-logs.sh',
    source: `#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/var/log/app"
DAYS=14

echo "▶ Comprimiendo logs con más de \${DAYS} días…"
find "$LOG_DIR" -name "*.log" -mtime +\${DAYS} -exec gzip {} \\;

echo "▶ Eliminando archivos comprimidos con más de 60 días…"
find "$LOG_DIR" -name "*.gz" -mtime +60 -delete

echo "✔ Rotación de logs completada"`,
  },
];

const RUN_STEP_MS = 420;

function outputFor(script: ScriptDef): string[] {
  switch (script.id) {
    case 'deploy-app':
      return [
        '▶ Compilando proyecto…',
        '  ✓ vite build completado en 8.2s',
        '▶ Sincronizando artefactos con el servidor…',
        '  ✓ 142 archivos transferidos (3.1 MB)',
        '▶ Reiniciando servicio…',
        '  ✓ app.service activo (running)',
        '✔ Despliegue completado',
      ];
    case 'backup-db':
      return [
        'Generando dump de la base de datos…',
        '  pg_dump → /tmp/backup-20260606-031544.sql.gz (48.2 MB)',
        'Subiendo a s3://deploy-monitor-backups/…',
        '  ✓ Transferencia completa',
        'Backup subido: /tmp/backup-20260606-031544.sql.gz',
      ];
    case 'health-check':
      return [
        '200 · 84ms · https://api.deploy-monitor.dev/health',
        '200 · 112ms · https://api.deploy-monitor.dev/status',
      ];
    case 'rotate-logs':
      return [
        '▶ Comprimiendo logs con más de 14 días…',
        '  ✓ 9 archivos comprimidos',
        '▶ Eliminando archivos comprimidos con más de 60 días…',
        '  ✓ 3 archivos eliminados (212 MB liberados)',
        '✔ Rotación de logs completada',
      ];
    default:
      return ['Script ejecutado.'];
  }
}

export type ExecutionState = {
  scriptId: string;
  status: RunStatus;
  lines: string[];
};

/** Hardcoded script catalog + simulated line-by-line remote execution. */
export function useMockScripts() {
  const [selectedId, setSelectedId] = useState<string>(SCRIPTS[0].id);
  const [execution, setExecution] = useState<ExecutionState | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const run = useCallback((id: string) => {
    const script = SCRIPTS.find((s) => s.id === id);
    if (!script) return;

    clearTimers();
    setExecution({ scriptId: id, status: 'running', lines: [] });

    const lines = outputFor(script);
    lines.forEach((line, i) => {
      const timer = setTimeout(() => {
        setExecution((prev) => {
          if (!prev || prev.scriptId !== id) return prev;
          return { ...prev, lines: [...prev.lines, line] };
        });
      }, RUN_STEP_MS * (i + 1));
      timers.current.push(timer);
    });

    const finishTimer = setTimeout(() => {
      setExecution((prev) => (prev && prev.scriptId === id ? { ...prev, status: 'success' } : prev));
    }, RUN_STEP_MS * (lines.length + 1));
    timers.current.push(finishTimer);
  }, [clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setExecution(null);
  }, [clearTimers]);

  const selected = SCRIPTS.find((s) => s.id === selectedId) ?? SCRIPTS[0];

  return { scripts: SCRIPTS, selected, select, execution, run, reset };
}
