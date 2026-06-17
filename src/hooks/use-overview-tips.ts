import { useState, useEffect } from 'react';

const TIPS = [
  'Usa `htop` para visualizar procesos y consumo de CPU en tiempo real.',
  'Revisa el espacio libre con `df -h` antes de cada deploy.',
  'Guarda logs de automatización en `/var/log/deploy/` para auditoría.',
  '`systemctl status <servicio>` confirma si un proceso está activo.',
  'Un snapshot antes de una migración puede ahorrarte horas de trabajo.',
  '`tail -f /var/log/syslog` muestra eventos del sistema en tiempo real.',
  'Configura alertas si el CPU supera el 80 % de forma sostenida.',
  '`tmux` mantiene tus sesiones activas aunque pierdas la conexión SSH.',
  '`docker system prune -a` libera imágenes y volúmenes sin uso.',
  'Verifica puertos activos con `ss -tlnp` antes de exponer servicios.',
  '`journalctl -u <servicio> --since "1h ago"` filtra logs recientes.',
  '`crontab -l` lista todas las tareas programadas del usuario actual.',
] as const;

export function useOverviewTips(): string {
  const [index, setIndex] = useState(
    () => Math.floor(Date.now() / 60_000) % TIPS.length,
  );

  useEffect(() => {
    const id = setInterval(() => {
      setIndex(Math.floor(Date.now() / 60_000) % TIPS.length);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return TIPS[index];
}
