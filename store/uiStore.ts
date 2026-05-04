import { create } from 'zustand';

export type UiError = {
  code: string;
  message?: string;
  data?: Record<string, unknown>;
};

type State = {
  isSyncing: boolean;
  lastError: UiError | null;
};

type Actions = {
  setSyncing: (v: boolean) => void;
  setError: (e: UiError | null) => void;
};

export const useUiStore = create<State & Actions>((set) => ({
  isSyncing: false,
  lastError: null,
  setSyncing: (v) => set({ isSyncing: v }),
  setError: (e) => set({ lastError: e }),
}));
