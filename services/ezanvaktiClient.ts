import {
  ApiError,
  ApiNotFoundError,
  ApiRateLimitError,
  ApiServerError,
  NetworkError,
} from './errors';
import { assertPrayerTimes } from './prayerValidation';
import { withRetry } from './retry';
import type { Country, District, PrayerTime, State } from './types';

import { API_PATHS, API_TIMEOUT_MS, BASE_URL } from '@/constants/api';
import { isApiResponse, type ApiResponse } from '@/utils/envelope';
import { logger } from '@/utils/logger';

async function get<T>(path: string): Promise<T> {
  return withRetry(() => fetchOnce<T>(path));
}

async function fetchOnce<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (e) {
    logger.error('network', { url, error: String(e) });
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
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

  let json: unknown;
  try {
    json = await res.json();
  } catch (e) {
    logger.error('invalid-json', { url, error: String(e) });
    throw new ApiError(res.status, 'Invalid JSON response');
  }
  if (!isApiResponse<T>(json)) {
    throw new ApiError(res.status, 'Unexpected response shape');
  }
  const env = json as ApiResponse<T>;
  if (!env.success) throw new ApiError(env.code, env.message);
  return env.data;
}

async function getStatesForCountry(path: string, countryId: string): Promise<State[]> {
  const states = await get<State[]>(path);
  if (states.some((state) => state.country_id !== countryId)) {
    throw new ApiError(502, 'Search states response contains a different country');
  }
  return states;
}

async function getDistrictsForState(path: string, stateId: string): Promise<District[]> {
  const districts = await get<District[]>(path);
  if (districts.some((district) => district.state_id !== stateId)) {
    throw new ApiError(502, 'Search districts response contains a different state');
  }
  return districts;
}

async function getPrayerTimes(path: string, context: string): Promise<PrayerTime[]> {
  return assertPrayerTimes(await get<unknown>(path), context);
}

export const ezanvakti = {
  countries: () => get<Country[]>(API_PATHS.countries),
  searchCountries: (q: string) => get<Country[]>(API_PATHS.searchCountries(q)),
  states: (countryId: string) => getStatesForCountry(API_PATHS.states(countryId), countryId),
  searchStates: (countryId: string, q: string) =>
    getStatesForCountry(API_PATHS.searchStates(countryId, q), countryId),
  districts: (stateId: string) => getDistrictsForState(API_PATHS.districts(stateId), stateId),
  searchDistricts: (stateId: string, q: string) =>
    getDistrictsForState(API_PATHS.searchDistricts(stateId, q), stateId),
  prayerTimesYearly: (districtId: string) =>
    getPrayerTimes(API_PATHS.prayerTimes(districtId, 'yearly'), 'yearly prayer times'),
  prayerTimesDaily: (districtId: string) =>
    getPrayerTimes(API_PATHS.prayerTimes(districtId, 'daily'), 'daily prayer times'),
  prayerTimesRange: (districtId: string, start: string, end: string) =>
    getPrayerTimes(API_PATHS.prayerTimesRange(districtId, start, end), 'range prayer times'),
};
