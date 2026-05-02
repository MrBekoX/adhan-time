import type { PrayerKey } from '@/constants/prayers';

export type Country = {
  _id: string;
  name: string;
  name_en: string;
};

export type State = Country & {
  country_id: string;
};

export type District = State & {
  state_id: string;
  url?: string;
};

export type PrayerTime = {
  date: string; // ISO yyyy-MM-ddT00:00:00.000Z
  imsak: string; // HH:MM
  gunes: string;
  ogle: string;
  ikindi: string;
  aksam: string;
  yatsi: string;
  hijri?: {
    day: number;
    month: number;
    month_name: string;
    year: number;
  };
};

export type YearlyPrayerCache = {
  districtId: string;
  year: number;
  fetchedAt: string;
  timezone: string;
  entries: PrayerTime[];
};

export type ScheduledPrayer = {
  id: string;
  prayerKey: PrayerKey;
  dateIso: string;
  fireAt: Date;
};
