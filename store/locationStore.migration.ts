import { COUNTRIES_REQUIRING_TZ_SELECTION } from '@/constants/timezones';
import { resolveTimezone } from '@/services/timezoneResolver';

export type PersistedLocation = {
  countryId: string;
  countryName: string;
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  timezone: string;
  /**
   * For COUNTRIES_REQUIRING_TZ_SELECTION (AU/ID/BR/RU) the user picks a zone
   * via the select-timezone onboarding screen; that choice lives here so the
   * resolver can prefer it over the synthetic country default.
   */
  userSelectedTimezone?: string;
};

type PersistedShape = { selected?: PersistedLocation | null };

/**
 * Persist v1 → v2 → v3 migration.
 *
 * v1 → v2: the previous COUNTRY_TZ table mapped many ezanvakti country IDs to
 *   the wrong IANA zone (66/70 mismatched), so the persisted timezone is
 *   stale for most non-Turkey users. We re-resolve via the corrected v2
 *   table; if the country ID is no longer recognised at all (e.g. user picked
 *   the synthetic id 1216), we reset to null and force re-onboarding.
 *
 * v2 → v3: AU/ID/BR/RU users were silently routed to the country default
 *   (Sydney / Jakarta / São Paulo / Moscow) because the API doesn't expose
 *   state-level entries for them. v3 introduces the select-timezone screen,
 *   so anyone in those four countries who hasn't picked a zone yet is sent
 *   back to onboarding to choose one explicitly.
 *
 * Pure for testability — keep AsyncStorage out of this module.
 */
export function migrateLocationState(
  persisted: unknown,
  version: number,
): { selected: PersistedLocation | null } {
  const safe = (persisted && typeof persisted === 'object' ? persisted : {}) as PersistedShape;
  let sel = safe.selected ?? null;

  if (version < 2) {
    if (!sel || !sel.countryId) {
      sel = null;
    } else {
      try {
        const tz = resolveTimezone(sel.countryId, sel.stateId);
        sel = { ...sel, timezone: tz };
      } catch {
        sel = null;
      }
    }
  }

  if (version < 3 && sel) {
    if (COUNTRIES_REQUIRING_TZ_SELECTION.has(sel.countryId) && !sel.userSelectedTimezone) {
      sel = null;
    }
  }

  return { selected: sel };
}
