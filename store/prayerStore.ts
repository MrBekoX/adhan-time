import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { YearlyPrayerCache } from '@/services/types';

type State = {
  cache: YearlyPrayerCache | null;
};

type Actions = {
  setCache: (cache: YearlyPrayerCache) => void;
  clear: () => void;
};

export const usePrayerStore = create<State & Actions>()(
  persist(
    (set) => ({
      cache: null,
      setCache: (cache) => set({ cache }),
      clear: () => set({ cache: null }),
    }),
    {
      name: 'prayer',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
