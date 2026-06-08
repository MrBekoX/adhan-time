import { validateRegisterPayload } from './validators';

const validPayload = {
  expoPushToken: 'ExponentPushToken[abcdefghij1234567890_-]',
  districtId: '9541',
  districtName: 'Üsküdar',
  countryName: 'Türkiye',
  timezone: 'Europe/Istanbul',
  locale: 'tr',
  sound: 'default',
  enabledPrayers: ['imsak', 'gunes'],
};

describe('validateRegisterPayload', () => {
  it('accepts a valid payload', () => {
    const r = validateRegisterPayload(validPayload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.timezone).toBe('Europe/Istanbul');
      expect(r.data.enabledPrayers).toEqual(['imsak', 'gunes']);
    }
  });

  it('defaults reminderMinutes to 0 when absent (old-client compatibility)', () => {
    const r = validateRegisterPayload(validPayload);
    expect(r.ok && r.data.reminderMinutes).toBe(0);
  });

  it('accepts an in-range reminderMinutes', () => {
    const r = validateRegisterPayload({ ...validPayload, reminderMinutes: 30 });
    expect(r.ok && r.data.reminderMinutes).toBe(30);
  });

  it('rejects a reminderMinutes above 30', () => {
    expect(validateRegisterPayload({ ...validPayload, reminderMinutes: 31 })).toEqual({
      ok: false,
      code: 'invalid_reminder',
    });
  });

  it('rejects a negative reminderMinutes', () => {
    expect(validateRegisterPayload({ ...validPayload, reminderMinutes: -1 })).toEqual({
      ok: false,
      code: 'invalid_reminder',
    });
  });

  it('rejects a non-integer reminderMinutes', () => {
    expect(validateRegisterPayload({ ...validPayload, reminderMinutes: 10.5 })).toEqual({
      ok: false,
      code: 'invalid_reminder',
    });
  });

  it('rejects null body', () => {
    expect(validateRegisterPayload(null)).toEqual({ ok: false, code: 'invalid_body' });
  });

  it('rejects non-object body', () => {
    expect(validateRegisterPayload('foo')).toEqual({ ok: false, code: 'invalid_body' });
  });

  it('rejects payload with malformed token', () => {
    expect(validateRegisterPayload({ ...validPayload, expoPushToken: 'hack' }))
      .toEqual({ ok: false, code: 'invalid_token' });
  });

  it('rejects payload with token missing closing bracket', () => {
    expect(validateRegisterPayload({ ...validPayload, expoPushToken: 'ExponentPushToken[abcdefghij1234567890' }))
      .toEqual({ ok: false, code: 'invalid_token' });
  });

  it('rejects payload with token too short', () => {
    expect(validateRegisterPayload({ ...validPayload, expoPushToken: 'ExponentPushToken[short]' }))
      .toEqual({ ok: false, code: 'invalid_token' });
  });

  it('rejects payload with token containing forbidden chars', () => {
    expect(validateRegisterPayload({ ...validPayload, expoPushToken: 'ExponentPushToken[abc def ghi 12345 6789012]' }))
      .toEqual({ ok: false, code: 'invalid_token' });
  });

  it('rejects payload with non-numeric district', () => {
    expect(validateRegisterPayload({ ...validPayload, districtId: 'abc' }))
      .toEqual({ ok: false, code: 'invalid_district' });
  });

  it('rejects payload with empty district', () => {
    expect(validateRegisterPayload({ ...validPayload, districtId: '' }))
      .toEqual({ ok: false, code: 'invalid_district' });
  });

  it('rejects payload with overlong district', () => {
    expect(validateRegisterPayload({ ...validPayload, districtId: '12345678' }))
      .toEqual({ ok: false, code: 'invalid_district' });
  });

  it('rejects payload with bogus IANA timezone', () => {
    expect(validateRegisterPayload({ ...validPayload, timezone: 'Mars/Phobos' }))
      .toEqual({ ok: false, code: 'invalid_timezone' });
  });

  it('rejects payload with empty timezone', () => {
    expect(validateRegisterPayload({ ...validPayload, timezone: '' }))
      .toEqual({ ok: false, code: 'invalid_timezone' });
  });

  it('rejects payload with overlong timezone', () => {
    expect(validateRegisterPayload({ ...validPayload, timezone: 'A'.repeat(100) }))
      .toEqual({ ok: false, code: 'invalid_timezone' });
  });

  it('rejects payload with unsupported locale', () => {
    expect(validateRegisterPayload({ ...validPayload, locale: 'fr' }))
      .toEqual({ ok: false, code: 'invalid_locale' });
  });

  it('accepts ar locale', () => {
    const r = validateRegisterPayload({ ...validPayload, locale: 'ar' });
    expect(r.ok).toBe(true);
  });

  it('accepts zh locale', () => {
    const r = validateRegisterPayload({ ...validPayload, locale: 'zh' });
    expect(r.ok).toBe(true);
  });

  it('rejects payload with unsupported sound', () => {
    expect(validateRegisterPayload({ ...validPayload, sound: 'azan' }))
      .toEqual({ ok: false, code: 'invalid_sound' });
  });

  it('accepts adhanShort sound', () => {
    const r = validateRegisterPayload({ ...validPayload, sound: 'adhanShort' });
    expect(r.ok).toBe(true);
  });

  it('accepts adhanLong sound (legacy — kept for back-compat)', () => {
    const r = validateRegisterPayload({ ...validPayload, sound: 'adhanLong' });
    expect(r.ok).toBe(true);
  });

  it('accepts notification sound (current option — new/migrated devices send this)', () => {
    const r = validateRegisterPayload({ ...validPayload, sound: 'notification' });
    expect(r.ok).toBe(true);
  });

  it('rejects payload with unknown prayer key', () => {
    expect(validateRegisterPayload({ ...validPayload, enabledPrayers: ['imsak', 'foo'] }))
      .toEqual({ ok: false, code: 'invalid_prayers' });
  });

  it('rejects payload with non-array enabledPrayers', () => {
    expect(validateRegisterPayload({ ...validPayload, enabledPrayers: 'imsak' }))
      .toEqual({ ok: false, code: 'invalid_prayers' });
  });

  it('rejects payload with empty enabledPrayers', () => {
    expect(validateRegisterPayload({ ...validPayload, enabledPrayers: [] }))
      .toEqual({ ok: false, code: 'invalid_prayers' });
  });

  it('rejects payload with overlong districtName (>128)', () => {
    expect(validateRegisterPayload({ ...validPayload, districtName: 'X'.repeat(129) }))
      .toEqual({ ok: false, code: 'invalid_district_name' });
  });

  it('rejects payload with empty districtName', () => {
    expect(validateRegisterPayload({ ...validPayload, districtName: '' }))
      .toEqual({ ok: false, code: 'invalid_district_name' });
  });

  it('rejects payload with overlong countryName', () => {
    expect(validateRegisterPayload({ ...validPayload, countryName: 'X'.repeat(129) }))
      .toEqual({ ok: false, code: 'invalid_country_name' });
  });

  it('strips additional unknown fields from the validated output', () => {
    const r = validateRegisterPayload({ ...validPayload, hacker: 'drop table devices' });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.data as Record<string, unknown>).hacker).toBeUndefined();
  });
});
