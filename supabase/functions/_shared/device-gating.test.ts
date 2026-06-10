import {
  LONG_STALE_MS,
  SHORT_STALE_MS,
  backstopCutoffMs,
  isDueForBackstop,
} from './device-gating';

describe('backstopCutoffMs', () => {
  it('uses the SHORT (3h) cutoff only for explicit android + not battery-exempt', () => {
    expect(backstopCutoffMs({ platform: 'android', battery_exempt: false })).toBe(SHORT_STALE_MS);
  });

  it('keeps the LONG (5d) cutoff for a battery-exempt android device (local reliable)', () => {
    expect(backstopCutoffMs({ platform: 'android', battery_exempt: true })).toBe(LONG_STALE_MS);
  });

  it('keeps the LONG cutoff for iOS regardless of exemption (local reliable)', () => {
    expect(backstopCutoffMs({ platform: 'ios', battery_exempt: false })).toBe(LONG_STALE_MS);
  });

  it('keeps the LONG cutoff when the client has not reported platform/exemption yet (null/undefined)', () => {
    // Safe default: no aggressive backstop until the client explicitly reports
    // android + battery_exempt=false → guarantees no double notifications pre-rollout.
    expect(backstopCutoffMs({ platform: null, battery_exempt: null })).toBe(LONG_STALE_MS);
    expect(backstopCutoffMs({})).toBe(LONG_STALE_MS);
    expect(backstopCutoffMs({ platform: 'android', battery_exempt: null })).toBe(LONG_STALE_MS);
  });
});

describe('isDueForBackstop', () => {
  const now = new Date('2026-06-10T12:00:00.000Z');
  const aggressive = { platform: 'android', battery_exempt: false };
  const reliable = { platform: 'ios', battery_exempt: false };

  it('android non-exempt: due once silent ≥ 3h', () => {
    expect(isDueForBackstop(aggressive, new Date(now.getTime() - 3 * 3600_000), now)).toBe(true);
    expect(isDueForBackstop(aggressive, new Date(now.getTime() - 2 * 3600_000), now)).toBe(false);
  });

  it('reliable device: due only once silent ≥ 5d (not at 3h)', () => {
    expect(isDueForBackstop(reliable, new Date(now.getTime() - 3 * 3600_000), now)).toBe(false);
    expect(isDueForBackstop(reliable, new Date(now.getTime() - 5 * 86400_000), now)).toBe(true);
  });
});
