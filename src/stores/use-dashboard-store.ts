import { create } from 'zustand';

export const SECTIONS = ['overview', 'monitor', 'scripts', 'history', 'settings'] as const;
export type SectionId = (typeof SECTIONS)[number];

type DashboardState = {
  activeSection: SectionId;
  sidebarCollapsed: boolean;
  terminalExpanded: boolean;
  navigateToSection: (section: SectionId) => void;
  toggleSidebar: () => void;
  toggleTerminal: () => void;
  setTerminalExpanded: (expanded: boolean) => void;
};

export const useDashboardStore = create<DashboardState>((set) => ({
  activeSection: 'overview',
  sidebarCollapsed: false,
  terminalExpanded: false,

  navigateToSection: (section) => set({ activeSection: section }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleTerminal: () => set((s) => ({ terminalExpanded: !s.terminalExpanded })),
  setTerminalExpanded: (expanded) => set({ terminalExpanded: expanded }),
}));
