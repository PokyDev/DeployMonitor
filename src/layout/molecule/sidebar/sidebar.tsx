import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  Activity,
  FileCode,
  History,
  Settings,
  LogOut,
  PanelLeft,
  Crown,
} from 'lucide-react';
import { useDashboardStore, SECTIONS, type SectionId } from '../../../stores/use-dashboard-store';
import type { ConnectionStage } from '../../../hooks/use-ssh-connection';
import './sidebar.css';

const NAV_ICONS: Record<SectionId, LucideIcon> = {
  overview: LayoutGrid,
  monitor: Activity,
  scripts: FileCode,
  history: History,
  settings: Settings,
};

const NAV_LABELS: Record<SectionId, string> = {
  overview: 'Dashboard',
  monitor: 'Monitoreo',
  scripts: 'Scripts',
  history: 'Historial',
  settings: 'Configuración',
};

const PRIMARY_SECTIONS = SECTIONS.filter((id) => id !== 'settings');

const CONNECTION_LABELS: Record<ConnectionStage, string> = {
  idle: 'Sin conexión',
  connecting: 'Conectando…',
  testing: 'Probando…',
  online: 'Conectado',
  verified: 'Conexión Verificada',
  error: 'Error de conexión',
};

type NavItemProps = {
  id: SectionId;
  active: boolean;
  collapsed: boolean;
  badge?: string | null;
  onClick: () => void;
};

function NavItem({ id, active, collapsed, badge, onClick }: NavItemProps) {
  const [hover, setHover] = useState(false);
  const Icon = NAV_ICONS[id];
  const label = NAV_LABELS[id];

  return (
    <button
      type="button"
      className={`sidebar-nav-item${active ? ' sidebar-nav-item--active' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-current={active ? 'page' : undefined}
    >
      {active && <span className="sidebar-nav-item__bar" aria-hidden="true" />}
      <Icon className="sidebar-nav-item__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
      {!collapsed && <span className="sidebar-nav-item__label">{label}</span>}
      {!collapsed && badge && <span className="sidebar-nav-item__badge">{badge}</span>}
      {collapsed && hover && <span className="sidebar-tooltip" role="tooltip">{label}</span>}
    </button>
  );
}

type FootButtonProps = {
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
};

function FootButton({ icon: Icon, label, collapsed, active, danger, onClick }: FootButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      className={`sidebar-foot-btn${danger ? ' sidebar-foot-btn--danger' : ''}${active ? ' sidebar-foot-btn--active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      {collapsed && hover && <span className="sidebar-tooltip" role="tooltip">{label}</span>}
    </button>
  );
}

type SidebarProps = {
  connectionStage: ConnectionStage;
  runningScripts: number;
  onLogout: () => void;
};

export default function Sidebar({ connectionStage, runningScripts, onLogout }: SidebarProps) {
  const collapsed = useDashboardStore((s) => s.sidebarCollapsed);
  const active = useDashboardStore((s) => s.activeSection);
  const toggleSidebar = useDashboardStore((s) => s.toggleSidebar);
  const navigateToSection = useDashboardStore((s) => s.navigateToSection);

  const connectionColor =
    connectionStage === 'online' ? 'var(--color-gold)' :
    connectionStage === 'error'  ? 'var(--color-error-light)' :
    'var(--color-idle)';

  const badgeFor = (id: SectionId): string | null => {
    if (id === 'scripts' && runningScripts > 0) return String(runningScripts);
    if (id === 'monitor' && connectionStage === 'online') return '●';
    return null;
  };

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} aria-label="Navegación del panel">
      <div className="sidebar__head">
        {!collapsed && (
          <div className="sidebar-brand">
            <Crown className="sidebar-brand__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="sidebar-brand__text">DeployMonitor</span>
          </div>
        )}
        <button
          type="button"
          className="sidebar-icon-btn"
          onClick={toggleSidebar}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          aria-label={collapsed ? 'Expandir panel lateral' : 'Colapsar panel lateral'}
          aria-pressed={collapsed}
        >
          <PanelLeft size={17} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Secciones">
        {PRIMARY_SECTIONS.map((id) => (
          <NavItem
            key={id}
            id={id}
            active={active === id}
            collapsed={collapsed}
            badge={badgeFor(id)}
            onClick={() => navigateToSection(id)}
          />
        ))}
      </nav>

      <div className="sidebar__foot">
        <div className="sidebar-foot-row">
          <div className={`sidebar-conn${collapsed ? ' sidebar-conn--collapsed' : ''}`}>
            <span
              className={`sidebar-conn__dot${connectionStage === 'online' ? ' sidebar-conn__dot--pulse' : ''}`}
              style={{ backgroundColor: connectionColor }}
              aria-hidden="true"
            />
            {!collapsed && <span className="sidebar-conn__label">{CONNECTION_LABELS[connectionStage]}</span>}
          </div>
          <FootButton
            icon={Settings}
            label="Configuración"
            collapsed={collapsed}
            active={active === 'settings'}
            onClick={() => navigateToSection('settings')}
          />
          <FootButton
            icon={LogOut}
            label="Cerrar sesión"
            collapsed={collapsed}
            danger
            onClick={onLogout}
          />
        </div>
      </div>
    </aside>
  );
}
