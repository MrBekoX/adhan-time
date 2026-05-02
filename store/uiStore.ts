import { create } from 'zustand';

type State = {
  isSyncing: boolean;
  lastError: string | null;
};

type Actions = {
  setSyncing: (v: boolean) => void;
  setError: (e: string | null) => void;
};

export const useUiStore = create<State & Actions>((set) => ({
  isSyncing: false,
  lastError: null,
  setSyncing: (v) => set({ isSyncing: v }),
  setError: (e) => set({ lastError: e }),
}));
