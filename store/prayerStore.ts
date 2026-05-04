import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { YearlyPrayerCache } from '@/services/types';

type State = {
  cache: YearlyPrayerCache | null;
  hydrated: boolean;
};

type Actions = {
  setCache: (cache: YearlyPrayerCache) => void;
  setHydrated: (v: boolean) => void;
  clear: () => void;
};

export const usePrayerStore = create<State & Actions>()(
  persist(
    (set) => ({
      cache: null,
      hydrated: false,
      setCache: (cache) => set({ cache }),
      setHydrated: (v) => set({ hydrated: v }),
      clear: () => set({ cache: null }),
    }),
    {
      name: 'prayer',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ cache: s.cache }),
      migrate: (persisted, version) => {
        // v1 cache stored times at the entry top-level (entry.imsak); v2 expects entry.times.imsak.
        // Discard old cache so the next app open triggers a fresh yearly fetch.
        if (version < 2) return { cache: null };
        return persisted as { cache: YearlyPrayerCache | null };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
