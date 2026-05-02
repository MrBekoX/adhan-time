import AsyncStorage from '@react-native-async-storage/async-storage';


import { ezanvakti } from './ezanvaktiClient';
import type { Country, District, State } from './types';

import { LOCATION_CACHE_TTL_MS } from '@/constants/api';

type Cached<T> = { fetchedAt: number; data: T };

async function readCache<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Cached<T>;
    if (Date.now() - parsed.fetchedAt > LOCATION_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, data: T): Promise<void> {
  const v: Cached<T> = { fetchedAt: Date.now(), data };
  await AsyncStorage.setItem(key, JSON.stringify(v));
}

export const locationCache = {
  async countries(): Promise<Country[]> {
    const k = 'locations:countries';
    const cached = await readCache<Country[]>(k);
    if (cached) return cached;
    const fresh = await ezanvakti.countries();
    await writeCache(k, fresh);
    return fresh;
  },
  async states(countryId: string): Promise<State[]> {
    const k = `locations:states:${countryId}`;
    const cached = await readCache<State[]>(k);
    if (cached) return cached;
    const fresh = await ezanvakti.states(countryId);
    await writeCache(k, fresh);
    return fresh;
  },
  async districts(stateId: string): Promise<District[]> {
    const k = `locations:districts:${stateId}`;
    const cached = await readCache<District[]>(k);
    if (cached) return cached;
    const fresh = await ezanvakti.districts(stateId);
    await writeCache(k, fresh);
    return fresh;
  },
};
