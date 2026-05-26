import AsyncStorage from '@react-native-async-storage/async-storage';

import { ezanvakti } from '../ezanvaktiClient';
import { locationCache } from '../locationCache';

jest.mock('../ezanvaktiClient', () => ({
  ezanvakti: {
    countries: jest.fn(),
    states: jest.fn(),
    districts: jest.fn(),
  },
}));

const countriesMock = ezanvakti.countries as jest.Mock;

describe('locationCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    countriesMock.mockReset();
    jest.useRealTimers();
  });

  it('ignores corrupt cache entries with non-finite fetchedAt values', async () => {
    await AsyncStorage.setItem(
      'locations:countries',
      JSON.stringify({ fetchedAt: Number.NaN, data: [{ _id: 'old', name: 'Old', name_en: 'Old' }] }),
    );
    countriesMock.mockResolvedValueOnce([{ _id: '2', name: 'TURKIYE', name_en: 'Turkey' }]);

    await expect(locationCache.countries()).resolves.toEqual([{ _id: '2', name: 'TURKIYE', name_en: 'Turkey' }]);
  });

  it('supports force refresh for retry buttons instead of returning stale cached locations', async () => {
    await AsyncStorage.setItem(
      'locations:countries',
      JSON.stringify({ fetchedAt: Date.now(), data: [{ _id: 'old', name: 'Old', name_en: 'Old' }] }),
    );
    countriesMock.mockResolvedValueOnce([{ _id: '15', name: 'INGILTERE', name_en: 'United Kingdom' }]);

    await expect(locationCache.countries({ force: true })).resolves.toEqual([
      { _id: '15', name: 'INGILTERE', name_en: 'United Kingdom' },
    ]);
  });
});
