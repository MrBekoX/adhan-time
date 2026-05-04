/**
 * F10: each persisted store exposes a `hydrated` flag that starts false and
 * flips to true via `setHydrated` (the persist `onRehydrateStorage` callback
 * is what calls it in real usage). The flag is in-memory only — never written
 * back to AsyncStorage — so a fresh app boot always re-evaluates it.
 */

import { useLocationStore } from '../locationStore';
import { usePrayerStore } from '../prayerStore';
import { useSettingsStore } from '../settingsStore';

describe('persisted stores expose a runtime hydrated flag (F10)', () => {
  it('locationStore — initial hydrated=false, setHydrated(true) flips it', () => {
    useLocationStore.setState({ hydrated: false });
    expect(useLocationStore.getState().hydrated).toBe(false);
    useLocationStore.getState().setHydrated(true);
    expect(useLocationStore.getState().hydrated).toBe(true);
  });

  it('settingsStore — exposes hydrated flag and setHydrated action', () => {
    useSettingsStore.setState({ hydrated: false });
    expect(useSettingsStore.getState().hydrated).toBe(false);
    useSettingsStore.getState().setHydrated(true);
    expect(useSettingsStore.getState().hydrated).toBe(true);
  });

  it('prayerStore — exposes hydrated flag and setHydrated action', () => {
    usePrayerStore.setState({ hydrated: false });
    expect(usePrayerStore.getState().hydrated).toBe(false);
    usePrayerStore.getState().setHydrated(true);
    expect(usePrayerStore.getState().hydrated).toBe(true);
  });

  it('settingsStore — partialize excludes hydrated from persisted blob', () => {
    type PartializeFn = (s: unknown) => Record<string, unknown>;
    const opts = (useSettingsStore as unknown as { persist: { getOptions: () => { partialize?: PartializeFn } } })
      .persist.getOptions();
    expect(typeof opts.partialize).toBe('function');
    const persisted = opts.partialize!({ ...useSettingsStore.getState(), hydrated: true });
    expect(persisted).not.toHaveProperty('hydrated');
  });

  it('prayerStore — partialize excludes hydrated from persisted blob', () => {
    type PartializeFn = (s: unknown) => Record<string, unknown>;
    const opts = (usePrayerStore as unknown as { persist: { getOptions: () => { partialize?: PartializeFn } } })
      .persist.getOptions();
    expect(typeof opts.partialize).toBe('function');
    const persisted = opts.partialize!({ ...usePrayerStore.getState(), hydrated: true });
    expect(persisted).not.toHaveProperty('hydrated');
  });
});
