import { create } from 'zustand';

type View = 'landing' | 'dashboard';
type Phase = 'idle' | 'exit' | 'enter';

type NavState = {
  view: View;
  phase: Phase;
  navigateTo: (target: View) => void;
  goToDashboard: () => void;
  goToLanding: () => void;
};

const FADE_DURATION = 380;

export const useNavStore = create<NavState>((set, get) => ({
  view: 'landing',
  phase: 'idle',

  navigateTo: (target) => {
    const { view, phase } = get();
    if (view === target || phase !== 'idle') return;

    set({ phase: 'exit' });

    setTimeout(() => {
      set({ view: target, phase: 'enter' });

      setTimeout(() => {
        set({ phase: 'idle' });
      }, FADE_DURATION);
    }, FADE_DURATION);
  },

  goToDashboard: () => get().navigateTo('dashboard'),
  goToLanding:   () => get().navigateTo('landing'),
}));
