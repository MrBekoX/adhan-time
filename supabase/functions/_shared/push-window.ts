// Pure-TS helpers for the push-prayer edge function.
// Uses only `Intl.DateTimeFormat` so this file runs identically in Deno
// (edge function runtime) and in Node (jest tests) — no extra deps.

export type FormatPattern = 'yyyy' | 'yyyy-MM-dd' | 'HH:mm';

export function formatInTz(d: Date, tz: string, pattern: FormatPattern): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  if (pattern === 'yyyy') return get('year');
  if (pattern === 'yyyy-MM-dd') return `${get('year')}-${get('month')}-${get('day')}`;
  const hh = get('hour') === '24' ? '00' : get('hour');
  return `${hh}:${get('minute')}`;
}

export function localYearInTz(d: Date, tz: string): number {
  return Number(formatInTz(d, tz, 'yyyy'));
}

function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  return localAsUtc - instant.getTime();
}

export function localTimestampToUtc(localDate: string, localTime: string, tz: string): Date {
  const dParts = localDate.split('-').map(Number);
  const tParts = localTime.split(':').map(Number);
  const [y, mo, d] = dParts;
  const [hh, mm] = tParts;
  if (
    dParts.length !== 3 ||
    tParts.length < 2 ||
    !Number.isFinite(y) ||
    !Number.isFinite(mo) ||
    !Number.isFinite(d) ||
    !Number.isFinite(hh) ||
    !Number.isFinite(mm)
  ) {
    throw new Error(`Invalid local timestamp: ${localDate} ${localTime}`);
  }
  const guess = Date.UTC(y as number, (mo as number) - 1, d as number, hh as number, mm as number);
  // Refine once to handle the offset jump around DST transitions.
  const offset1 = tzOffsetMs(new Date(guess), tz);
  const refined = guess - offset1;
  const offset2 = tzOffsetMs(new Date(refined), tz);
  return new Date(guess - offset2);
}

export function isWithinPrayerWindow(
  localDate: string,
  localTime: string,
  tz: string,
  now: Date,
  windowMs = 60_000,
): boolean {
  const prayerInstant = localTimestampToUtc(localDate, localTime, tz);
  const diff = now.getTime() - prayerInstant.getTime();
  return diff >= 0 && diff < windowMs;
}
