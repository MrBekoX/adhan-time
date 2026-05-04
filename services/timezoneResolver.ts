import { COUNTRY_TZ } from '@/constants/timezones';

export function isCountrySupported(countryId: string): boolean {
  return countryId in COUNTRY_TZ;
}

export function resolveTimezone(countryId: string, stateId?: string | null): string {
  const entry = COUNTRY_TZ[countryId];
  if (!entry) {
    throw new Error(`tz-resolver-unsupported-country:${countryId}`);
  }
  if (typeof entry === 'string') return entry;
  if (stateId && entry.states) {
    const stateTz = entry.states[stateId];
    if (stateTz) return stateTz;
  }
  return entry.default;
}
