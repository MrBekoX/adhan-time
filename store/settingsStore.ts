import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { migrateSettingsState } from './settingsStore.migration';

import { REMINDER_MAX_MINUTES } from '@/constants/notifications';
import { DEFAULT_ENABLED_PRAYERS, type PrayerKey } from '@/constants/prayers';
import type { Locale } from '@/locales/i18n';

type State = {
  locale: Locale;
  sound: 'default' | 'notification';
  enabledPrayers: PrayerKey[];
  // Minutes before each adhan to fire a pre-prayer reminder (0 = off, max 30).
  reminderMinutes: number;
  onboardingCompleted: boolean;
  notificationPermissionDenied: boolean;
  // Persisted across launches so a registration failure during onboarding
  // (or any prior outage) gets retried on the next foreground tick even
  // after the app process is killed.
  deviceRegistrationPending: boolean;
  hydrated: boolean;
};

type Actions = {
  setLocale: (locale: State['locale']) => void;
  setSound: (sound: State['sound']) => void;
  togglePrayer: (key: PrayerKey) => void;
  setReminderMinutes: (min: number) => void;
  setOnboardingCompleted: (v: boolean) => void;
  setNotificationPermissionDenied: (v: boolean) => void;
  setDeviceRegistrationPending: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  reset: () => void;
};

const initial: State = {
  locale: 'tr',
  // New users get the app's bundled notification sound out of the box; they can
  // switch to the plain system sound in Settings.
  sound: 'notification',
  enabledPrayers: [...DEFAULT_ENABLED_PRAYERS],
  // Pre-prayer reminder defaults to off; opt-in from Settings.
  reminderMinutes: 0,
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
      setReminderMinutes: (min) =>
        set({ reminderMinutes: Math.max(0, Math.min(REMINDER_MAX_MINUTES, Math.round(min))) }),
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
          // Explicit so a future change to initial.deviceRegistrationPending
          // can't silently keep a stale flag through "Delete my data" — a
          // wiped device has no server row left to retry against.
          deviceRegistrationPending: false,
          hydrated: get().hydrated,
        }),
    }),
    {
      name: 'settings',
      version: 6,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        locale: s.locale,
        sound: s.sound,
        enabledPrayers: s.enabledPrayers,
        reminderMinutes: s.reminderMinutes,
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
