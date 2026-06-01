import { COUNTRY_TZ } from '@/constants/timezones';
import { logger } from '@/utils/logger';

// District-level timezone overrides: `{ [countryId]: { [districtId]: ianaTz } }`.
// COUNTRY_TZ resolves to a country's (or state's) MAJORITY zone; this map carves
// out the minority districts that sit in a different zone. It is checked BEFORE
// the state map (see resolveTimezone), so an entry here always wins.
//
// Known candidates to fill once the API's district IDs are confirmed (each would
// otherwise be ~1–2h off — religiously significant, see rules/08 & 11):
//   - US panhandle/border counties: FL panhandle → America/Chicago,
//     E. Tennessee → America/New_York, El Paso (TX) → America/Denver, etc.
//   - China (countryId 61): Xinjiang/Ürümqi districts actually run Asia/Urumqi
//     (UTC+6) vs the official Asia/Shanghai (UTC+8) used countrywide.
// Empty until we verify the upstream supplies these as distinct district IDs;
// guessing IDs would risk sending the WRONG correction.
const DISTRICT_TZ_OVERRIDES: Record<string, Record<string, string>> = {};

export function isCountrySupported(countryId: string): boolean {
  return countryId in COUNTRY_TZ;
}

export function resolveTimezone(
  countryId: string,
  stateId?: string | null,
  districtId?: string | null,
): string {
  const entry = COUNTRY_TZ[countryId];
  if (!entry) {
    logger.error('tz-resolver-unknown-country', { countryId });
    throw new Error(`tz-resolver-unsupported-country:${countryId}`);
  }
  if (typeof entry === 'string') return entry;
  if (districtId) {
    const districtTz = DISTRICT_TZ_OVERRIDES[countryId]?.[districtId];
    if (districtTz) return districtTz;
  }
  if (stateId && entry.states) {
    const stateTz = entry.states[stateId];
    if (stateTz) return stateTz;
    logger.error('tz-resolver-unknown-state', { countryId, stateId, districtId });
    throw new Error(`timezone-unknown-state:${countryId}:${stateId}`);
  }
  return entry.default;
}
