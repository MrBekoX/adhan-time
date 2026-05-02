import * as Localization from 'expo-localization';

import { COUNTRY_TZ } from '@/constants/timezones';
import { logger } from '@/utils/logger';

export function resolveTimezone(countryId: string, stateId?: string | null): string {
  const entry = COUNTRY_TZ[countryId];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    if (stateId && entry.states) {
      const stateTz = entry.states[stateId];
      if (stateTz) return stateTz;
    }
    return entry.default;
  }
  const calendar = Localization.getCalendars()[0];
  const deviceTz = calendar?.timeZone ?? 'Europe/Istanbul';
  logger.warn('tz fallback', { countryId, stateId, deviceTz });
  return deviceTz;
}
