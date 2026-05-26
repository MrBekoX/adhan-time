import { COUNTRY_TZ } from '@/constants/timezones';
import { logger } from '@/utils/logger';

const DISTRICT_TZ_OVERRIDES: Record<string, Record<string, string>> = {
  // Reserved for API district IDs that cross a state/province majority zone
  // (for example far-west US counties). Keep this checked before state maps.
};

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
