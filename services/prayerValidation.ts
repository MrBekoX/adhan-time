import { ApiError } from './errors';
import type { PrayerTime } from './types';

import { PRAYER_KEYS } from '@/constants/prayers';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrayerEntry(value: unknown): value is PrayerTime {
  if (!isRecord(value) || typeof value.date !== 'string' || !isRecord(value.times)) {
    return false;
  }
  const times = value.times;
  return PRAYER_KEYS.every((key) => {
    const time = times[key];
    return typeof time === 'string' && time.length > 0;
  });
}

export function assertPrayerTimes(value: unknown, context: string): PrayerTime[] {
  if (!Array.isArray(value)) {
    throw new ApiError(502, `${context}: prayer response is not an array`);
  }
  if (value.length === 0) {
    throw new ApiError(502, `${context}: empty prayer response`);
  }
  if (!value.every(isPrayerEntry)) {
    throw new ApiError(502, `${context}: malformed prayer response`);
  }
  return value;
}
