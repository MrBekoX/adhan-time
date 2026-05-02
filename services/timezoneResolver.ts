import * as Localization from 'expo-localization';

import { COUNTRY_TZ } from '@/constants/timezones';
import { logger } from '@/utils/logger';

export function resolveTimezone(countryId: string, stateId?: string | null): string {
  const entry = COUNTRY_TZ[countryId];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    if (stateId && entry.states && entry.states[stateId]) return entry.states[stateId];
    return entry.default;
  }
  const deviceTz = Localization.getCalendars()[0]?.timeZone ?? 'Europe/Istanbul';
  logger.warn('tz fallback', { countryId, stateId, deviceTz });
  return deviceTz;
}
