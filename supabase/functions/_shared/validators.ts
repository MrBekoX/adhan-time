// Pure-TS payload validators for the register-device edge function.
// Runs in Deno (edge runtime) and Node (jest) — no platform-specific imports.

const ALLOWED_LOCALES = new Set(['tr', 'en', 'ar', 'zh']);
const ALLOWED_PRAYERS = new Set(['imsak', 'gunes', 'ogle', 'ikindi', 'aksam', 'yatsi']);
const ALLOWED_SOUNDS = new Set(['default', 'adhanShort']);
const TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]{20,40}\]$/;
const DISTRICT_RE = /^\d{1,7}$/;
const MAX_STRING_LEN = 128;
const MAX_TZ_LEN = 64;

export type Locale = 'tr' | 'en' | 'ar' | 'zh';
export type Sound = 'default' | 'adhanShort';

export type ValidPayload = {
  expoPushToken: string;
  districtId: string;
  districtName: string;
  countryName: string;
  timezone: string;
  locale: Locale;
  sound: Sound;
  enabledPrayers: string[];
};

export type ValidationResult =
  | { ok: true; data: ValidPayload }
  | { ok: false; code: string };

export function validateRegisterPayload(body: unknown): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'invalid_body' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.expoPushToken !== 'string' || !TOKEN_RE.test(b.expoPushToken)) {
    return { ok: false, code: 'invalid_token' };
  }
  if (typeof b.districtId !== 'string' || !DISTRICT_RE.test(b.districtId)) {
    return { ok: false, code: 'invalid_district' };
  }
  if (typeof b.timezone !== 'string' || b.timezone.length === 0 || b.timezone.length > MAX_TZ_LEN) {
    return { ok: false, code: 'invalid_timezone' };
  }
  if (!isValidIanaTimezone(b.timezone)) {
    return { ok: false, code: 'invalid_timezone' };
  }
  if (typeof b.locale !== 'string' || !ALLOWED_LOCALES.has(b.locale)) {
    return { ok: false, code: 'invalid_locale' };
  }
  if (typeof b.sound !== 'string' || !ALLOWED_SOUNDS.has(b.sound)) {
    return { ok: false, code: 'invalid_sound' };
  }
  if (!Array.isArray(b.enabledPrayers) || b.enabledPrayers.length === 0) {
    return { ok: false, code: 'invalid_prayers' };
  }
  for (const p of b.enabledPrayers) {
    if (typeof p !== 'string' || !ALLOWED_PRAYERS.has(p)) {
      return { ok: false, code: 'invalid_prayers' };
    }
  }
  if (
    typeof b.districtName !== 'string' ||
    b.districtName.length === 0 ||
    b.districtName.length > MAX_STRING_LEN
  ) {
    return { ok: false, code: 'invalid_district_name' };
  }
  if (
    typeof b.countryName !== 'string' ||
    b.countryName.length === 0 ||
    b.countryName.length > MAX_STRING_LEN
  ) {
    return { ok: false, code: 'invalid_country_name' };
  }

  return {
    ok: true,
    data: {
      expoPushToken: b.expoPushToken,
      districtId: b.districtId,
      districtName: b.districtName,
      countryName: b.countryName,
      timezone: b.timezone,
      locale: b.locale as Locale,
      sound: b.sound as Sound,
      enabledPrayers: [...(b.enabledPrayers as string[])],
    },
  };
}

function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
