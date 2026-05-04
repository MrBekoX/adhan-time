import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { migrateSettingsState } from './settingsStore.migration';

import { DEFAULT_ENABLED_PRAYERS, type PrayerKey } from '@/constants/prayers';
import type { Locale } from '@/locales/i18n';

type State = {
  locale: Locale;
  sound: 'default' | 'adhanShort';
  enabledPrayers: PrayerKey[];
  onboardingCompleted: boolean;
  notificationPermissionDenied: boolean;
  // V16+F6: persisted across launches so a registration failure during
  // onboarding (or yesterday's outage) is retried on the next foreground tick
  // even after the app process is killed.
  deviceRegistrationPending: boolean;
  hydrated: boolean;
};

type Actions = {
  setLocale: (locale: State['locale']) => void;
  setSound: (sound: State['sound']) => void;
  togglePrayer: (key: PrayerKey) => void;
  setOnboardingCompleted: (v: boolean) => void;
  setNotificationPermissionDenied: (v: boolean) => void;
  setDeviceRegistrationPending: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  reset: () => void;
};

const initial: State = {
  locale: 'tr',
  sound: 'default',
  enabledPrayers: [...DEFAULT_ENABLED_PRAYERS],
  onboardingCompleted: false,
  notificationPermissionDenied: false,
  deviceRegistrationPending: false,
  hydrated: false,
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
      setNotificationPermissionDenied: (v) => set({ notificationPermissionDenied: v }),
      setDeviceRegistrationPending: (v) => set({ deviceRegistrationPending: v }),
      setHydrated: (v) => set({ hydrated: v }),
      reset: () =>
        set({
          ...initial,
          // notificationPermissionDenied tracks the OS permission state — a
          // local "reset" can't grant the user's permission back, so keep it.
          notificationPermissionDenied: get().notificationPermissionDenied,
          hydrated: get().hydrated,
        }),
    }),
    {
      name: 'settings',
      version: 3,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        locale: s.locale,
        sound: s.sound,
        enabledPrayers: s.enabledPrayers,
        onboardingCompleted: s.onboardingCompleted,
        notificationPermissionDenied: s.notificationPermissionDenied,
        deviceRegistrationPending: s.deviceRegistrationPending,
      }),
      migrate: (persisted, version) => migrateSettingsState(persisted, version) as State,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
