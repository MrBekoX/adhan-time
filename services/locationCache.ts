import AsyncStorage from '@react-native-async-storage/async-storage';


import { ezanvakti } from './ezanvaktiClient';
import type { Country, District, State } from './types';

import { LOCATION_CACHE_TTL_MS } from '@/constants/api';

type Cached<T> = { fetchedAt: number; data: T };
type CacheOptions = { force?: boolean };

async function readCache<T>(key: string, isValidData: (value: unknown) => value is T): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Cached<unknown>>;
    const fetchedAt = parsed.fetchedAt;
    if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null;
    if (!isValidData(parsed.data)) return null;
    if (Date.now() - fetchedAt > LOCATION_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  const v: Cached<T> = { fetchedAt: Date.now(), data };
  await AsyncStorage.setItem(key, JSON.stringify(v));
}

function isArrayOf<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export const locationCache = {
  async countries(options: CacheOptions = {}): Promise<Country[]> {
    const k = 'locations:countries';
    const cached = options.force ? null : await readCache<Country[]>(k, isArrayOf);
    if (cached) return cached;
    const fresh = await ezanvakti.countries();
    await writeCache(k, fresh);
    return fresh;
  },
  async states(countryId: string, options: CacheOptions = {}): Promise<State[]> {
    const k = `locations:states:${countryId}`;
    const cached = options.force ? null : await readCache<State[]>(k, isArrayOf);
    if (cached) return cached;
    const fresh = await ezanvakti.states(countryId);
    await writeCache(k, fresh);
    return fresh;
  },
  async districts(stateId: string, options: CacheOptions = {}): Promise<District[]> {
    const k = `locations:districts:${stateId}`;
    const cached = options.force ? null : await readCache<District[]>(k, isArrayOf);
    if (cached) return cached;
    const fresh = await ezanvakti.districts(stateId);
    await writeCache(k, fresh);
    return fresh;
  },
};
