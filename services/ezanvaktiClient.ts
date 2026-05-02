import {
  ApiError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiServerError,
  NetworkError,
} from './errors';
import type { Country, District, PrayerTime, State } from './types';

import { API_PATHS, BASE_URL } from '@/constants/api';
import { isApiResponse, type ApiResponse } from '@/utils/envelope';
import { logger } from '@/utils/logger';


async function get<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  } catch (e) {
    logger.error('network', { url, error: String(e) });
    throw new NetworkError();
  }

  if (res.status === 429) {
    const ra = Number(res.headers.get('retry-after') ?? '60');
    throw new ApiRateLimitError(Number.isFinite(ra) ? ra : 60);
  }
  if (res.status === 404) throw new ApiNotFoundError();
  if (res.status >= 500) {
    throw new ApiServerError(res.status, await res.text().catch(() => res.statusText));
  }
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => res.statusText));
  }

  const json: unknown = await res.json();
  if (!isApiResponse<T>(json)) {
    throw new ApiError(res.status, 'Unexpected response shape');
  }
  const env = json as ApiResponse<T>;
  if (!env.success) throw new ApiError(env.code, env.message);
  return env.data;
}

export const ezanvakti = {
  countries: () => get<Country[]>(API_PATHS.countries),
  searchCountries: (q: string) => get<Country[]>(API_PATHS.searchCountries(q)),
  states: (countryId: string) => get<State[]>(API_PATHS.states(countryId)),
  searchStates: (countryId: string, q: string) =>
    get<State[]>(API_PATHS.searchStates(countryId, q)),
  districts: (stateId: string) => get<District[]>(API_PATHS.districts(stateId)),
  searchDistricts: (stateId: string, q: string) =>
    get<District[]>(API_PATHS.searchDistricts(stateId, q)),
  prayerTimesYearly: (districtId: string) =>
    get<PrayerTime[]>(API_PATHS.prayerTimes(districtId, 'yearly')),
  prayerTimesDaily: (districtId: string) =>
    get<PrayerTime[]>(API_PATHS.prayerTimes(districtId, 'daily')),
  prayerTimesRange: (districtId: string, start: string, end: string) =>
    get<PrayerTime[]>(API_PATHS.prayerTimesRange(districtId, start, end)),
};
