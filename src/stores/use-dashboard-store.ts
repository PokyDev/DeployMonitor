import { create } from 'zustand';
import type { ConnectionStage } from '../hooks/use-ssh-connection';

export const SECTIONS = ['overview', 'monitor', 'scripts', 'history', 'settings'] as const;
export type SectionId = (typeof SECTIONS)[number];

type DashboardState = {
  activeSection: SectionId;
  sidebarCollapsed: boolean;
  terminalExpanded: boolean;
  connectionStage: ConnectionStage;
  navigateToSection: (section: SectionId) => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  setTerminalExpanded: (expanded: boolean) => void;
  setConnectionStage: (stage: ConnectionStage) => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  activeSection: 'overview',
  sidebarCollapsed: false,
  terminalExpanded: false,
  connectionStage: 'idle',

  navigateToSection: (section) => set({ activeSection: section }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalExpanded: !s.terminalExpanded })),
  setTerminalExpanded: (expanded) => set({ terminalExpanded: expanded }),
  setConnectionStage: (stage) => set({ connectionStage: stage }),
}));
