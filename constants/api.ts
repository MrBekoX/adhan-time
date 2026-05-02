export const BASE_URL = 'https://ezanvakti.imsakiyem.com/api';

export const API_PATHS = {
  countries: '/locations/countries',
  countryById: (id: string) => `/locations/countries/${id}`,
  searchCountries: (q: string) => `/locations/search/countries?q=${encodeURIComponent(q)}`,
  states: (countryId: string) => `/locations/states?countryId=${countryId}`,
  stateById: (id: string) => `/locations/states/${id}`,
  searchStates: (countryId: string, q: string) =>
    `/locations/search/states?countryId=${countryId}&q=${encodeURIComponent(q)}`,
  districts: (stateId: string) => `/locations/districts?stateId=${stateId}`,
  districtById: (id: string) => `/locations/districts/${id}`,
  searchDistricts: (stateId: string, q: string) =>
    `/locations/search/districts?stateId=${stateId}&q=${encodeURIComponent(q)}`,
  prayerTimes: (districtId: string, period: 'daily' | 'weekly' | 'monthly' | 'yearly') =>
    `/prayer-times/${districtId}/${period}`,
  prayerTimesRange: (districtId: string, startDate: string, endDate: string) =>
    `/prayer-times/${districtId}/range?startDate=${startDate}&endDate=${endDate}`,
} as const;

export const LOCATION_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const PRAYER_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
