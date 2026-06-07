import { useState, type ReactNode } from 'react';
import { Moon, Sun, Monitor as MonitorIcon, Lock, LogOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { useMockConnection } from '../../../hooks/use-mock-connection';
import { useDashboardStore } from '../../../stores/use-dashboard-store';
import './settings.css';

type Connection = ReturnType<typeof useMockConnection>;

type ThemeChoice = 'dark' | 'light' | 'system';

const THEMES: { id: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { id: 'dark', label: 'Oscuro', icon: Moon },
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'system', label: 'Sistema', icon: MonitorIcon },
];

function SettingsCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dm-card settings-card">
      <div className="dm-label">{label}</div>
      {children}
    </div>
  );
}

function SettingsRow({
  title,
  desc,
  mono,
  action,
}: {
  title: string;
  desc?: string;
  mono?: string;
  action: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__info">
        <span className="settings-row__title">{title}</span>
        {desc && <span className="settings-row__desc">{desc}</span>}
        {mono && <span className="settings-row__mono">{mono}</span>}
      </div>
      {action}
    </div>
  );
}

type SettingsProps = {
  connection: Connection;
};

export default function SettingsView({ connection }: SettingsProps) {
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('dark');
  const navigateToSection = useDashboardStore((s) => s.navigateToSection);

  return (
    <div className="dashboard__content-inner dm-section">
      <div className="dm-section-bar">
        <div>
          <div className="dm-section-title">Configuración</div>
          <div className="dm-section-desc">Preferencias de la aplicación</div>
        </div>
      </div>

      <div className="settings-wrap">
        <SettingsCard label="Apariencia">
          <SettingsRow
            title="Tema"
            desc="Esquema de color de la interfaz"
            action={
              <div className="settings-seg" role="group" aria-label="Selector de tema">
                {THEMES.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`settings-seg__btn${themeChoice === id ? ' settings-seg__btn--active' : ''}`}
                    onClick={() => setThemeChoice(id)}
                    aria-pressed={themeChoice === id}
                  >
                    <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            }
          />
        </SettingsCard>

        <SettingsCard label="Conexión SSH">
          <SettingsRow
            title="Instancia configurada"
            mono={connection.isOnline ? connection.info.host : 'No configurada'}
            action={
              <button type="button" className="dm-btn dm-btn--sm" onClick={() => navigateToSection('overview')}>
                Ir al dashboard
              </button>
            }
          />
        </SettingsCard>

        <SettingsCard label="Cuenta">
          <SettingsRow
            title="André Coragem"
            desc="andre@coragem.dev"
            action={
              <div className="settings-row__actions">
                <button type="button" className="dm-btn dm-btn--sm">
                  <Lock size={14} strokeWidth={1.5} aria-hidden="true" />
                  Cambiar contraseña
                </button>
                <button type="button" className="dm-btn dm-btn--sm dm-btn--danger">
                  <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
                  Cerrar sesión
                </button>
              </div>
            }
          />
        </SettingsCard>

        <SettingsCard label="Acerca de">
          <SettingsRow
            title="DeployMonitor"
            desc="Tauri V2 · React · Rust"
            action={<span className="settings-row__mono">v0.1.0</span>}
          />
        </SettingsCard>
      </div>
    </div>
  );
}
