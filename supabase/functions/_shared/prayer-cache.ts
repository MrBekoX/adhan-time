// Pure, testable envelope check for the ezanvakti yearly endpoint.
// Bad upstream responses must NOT enter prayer_cache — the cache TTL is 30
// days, so a single bad write would silence push notifications for a month.

const PRAYER_KEYS = ['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi'] as const;
type PrayerKey = (typeof PRAYER_KEYS)[number];

export type PrayerEntry = {
  date: string;
  times: Record<PrayerKey, string>;
};

export type EnvelopeResult =
  | { ok: true; data: PrayerEntry[] }
  | { ok: false; reason: string };

const YEARLY_URL = (districtId: string): string =>
  `https://ezanvakti.imsakiyem.com/api/prayer-times/${districtId}/yearly`;

export async function fetchPrayerYear(
  fetcher: typeof fetch,
  districtId: string,
): Promise<EnvelopeResult> {
  let res: Response;
  try {
    res = await fetcher(YEARLY_URL(districtId));
  } catch {
    return { ok: false, reason: 'network-error' };
  }
  if (!res.ok) return { ok: false, reason: `upstream-${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (!json || typeof json !== 'object') return { ok: false, reason: 'bad-envelope' };
  const j = json as { success?: unknown; data?: unknown };
  if (j.success !== true) return { ok: false, reason: 'success-false' };
  if (!Array.isArray(j.data)) return { ok: false, reason: 'data-not-array' };
  if (j.data.length === 0) return { ok: false, reason: 'empty-data' };
  if (!isPrayerEntryArray(j.data)) return { ok: false, reason: 'bad-prayer-entry' };
  return { ok: true, data: j.data as PrayerEntry[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrayerEntry(value: unknown): value is PrayerEntry {
  if (!isRecord(value) || typeof value.date !== 'string' || !isRecord(value.times)) {
    return false;
  }
  return PRAYER_KEYS.every((key) => typeof value.times[key] === 'string' && value.times[key].length > 0);
}

export function isPrayerEntryArray(value: unknown): value is PrayerEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every(isPrayerEntry);
}
