import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_ENABLED_PRAYERS, type PrayerKey } from '@/constants/prayers';
import type { Locale } from '@/locales/i18n';

type State = {
  locale: Locale;
  sound: 'default' | 'adhanShort';
  enabledPrayers: PrayerKey[];
  onboardingCompleted: boolean;
};

type Actions = {
  setLocale: (locale: State['locale']) => void;
  setSound: (sound: State['sound']) => void;
  togglePrayer: (key: PrayerKey) => void;
  setOnboardingCompleted: (v: boolean) => void;
  reset: () => void;
};

const initial: State = {
  locale: 'tr',
  sound: 'default',
  enabledPrayers: [...DEFAULT_ENABLED_PRAYERS],
  onboardingCompleted: false,
};

export const useSettingsStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,
      setLocale: (locale) => set({ locale }),
      setSound: (sound) => set({ sound }),
      togglePrayer: (key) => {
        const cur = get().enabledPrayers;
        const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
        set({ enabledPrayers: next });
      },
      setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),
      reset: () => set(initial),
    }),
    {
      name: 'settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
