import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { migrateLocationState, type PersistedLocation } from './locationStore.migration';

type Location = PersistedLocation;

type State = {
  selected: Location | null;
  hydrated: boolean;
};

type Actions = {
  selectLocation: (loc: Location) => void;
  reset: () => void;
  setHydrated: (v: boolean) => void;
};

export const useLocationStore = create<State & Actions>()(
  persist(
    (set) => ({
      selected: null,
      hydrated: false,
      selectLocation: (loc) => set({ selected: loc }),
      reset: () => set({ selected: null }),
      setHydrated: (v) => set({ hydrated: v }),
    }),
    {
      name: 'location',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ selected: s.selected }),
      migrate: (persisted, version) => migrateLocationState(persisted, version),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
