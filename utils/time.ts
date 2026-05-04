import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * "HH:MM" + ISO date + IANA tz → real Date (UTC instant).
 * Date string'in saat kısmı yok sayılır; sadece YYYY-MM-DD kullanılır.
 */
export function parsePrayerTime(hhmm: string, dateIso: string, tz: string): Date {
  if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) {
    throw new Error(`Invalid prayer time: ${hhmm}`);
  }
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid prayer time: ${hhmm}`);
  }
  const dateOnly = dateIso.slice(0, 10);
  const localIso = `${dateOnly}T${pad(h)}:${pad(m)}:00`;
  const result = fromZonedTime(localIso, tz);
  if (Number.isNaN(result.getTime())) {
    throw new Error(`Invalid prayer time: ${hhmm} (${tz})`);
  }
  return result;
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

/**
 * Local year of `date` evaluated in IANA tz. Returns UTC year would be wrong
 * for late-December-in-Asia/early-January-in-Americas cases.
 */
export function yearInTz(date: Date, tz: string): number {
  return Number(formatInTimeZone(date, tz, 'yyyy'));
}

/**
 * Pure calendar-day arithmetic on `YYYY-MM-DD`. DST-safe: ignores wall-clock
 * offsets entirely. Used for rolling-window date generation.
 */
export function addLocalDays(dateIso: string, days: number): string {
  const dateOnly = dateIso.slice(0, 10);
  const parts = dateOnly.split('-').map(Number);
  const [y, m, d] = parts;
  if (
    parts.length !== 3 ||
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d)
  ) {
    throw new Error(`Invalid date: ${dateIso}`);
  }
  const dt = new Date(Date.UTC(y as number, (m as number) - 1, d as number));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function diffInSeconds(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 1000);
}

export function formatHHMM(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'HH:mm');
}
