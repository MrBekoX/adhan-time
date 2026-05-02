import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * "HH:MM" + ISO date + IANA tz → real Date (UTC instant).
 * Date string'in saat kısmı yok sayılır; sadece YYYY-MM-DD kullanılır.
 */
export function parsePrayerTime(hhmm: string, dateIso: string, tz: string): Date {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`Invalid prayer time: ${hhmm}`);
  }
  const dateOnly = dateIso.slice(0, 10);
  const localIso = `${dateOnly}T${pad(h)}:${pad(m)}:00`;
  return fromZonedTime(localIso, tz);
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export type DateComponents = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

/**
 * Verilen instant'ı IANA tz'de bileşenlerine ayır.
 * `expo-notifications` CalendarTrigger için.
 */
export function getDateComponentsInTz(date: Date, tz: string): DateComponents {
  const formatted = formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm");
  const [datePart = '', timePart = ''] = formatted.split('T');
  const [y = 0, mo = 0, d = 0] = datePart.split('-').map(Number);
  const [h = 0, mi = 0] = timePart.split(':').map(Number);
  return { year: y, month: mo, day: d, hour: h, minute: mi };
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export function isoDateInTz(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

export function diffInSeconds(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 1000);
}

export function formatHHMM(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'HH:mm');
}
