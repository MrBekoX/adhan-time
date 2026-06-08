import { ROSE_FOLLOW_LAMBDA, ROSE_FOLLOW_MAX_DT_SEC } from '@/constants/qibla';

import {
  applyEma,
  headingSmoothingAlphaForPlatform,
  isInterference,
  nextRoseRotation,
  resolveHeadingReliability,
  roseFollowStep,
  roseSpringConfig,
  shouldPublishHeadingUpdate,
  shortestRotationDelta,
  signedDelta,
} from './heading';

const normalizeDeg = (x: number): number => ((x % 360) + 360) % 360;

describe('applyEma', () => {
  it('returns raw on first reading', () => {
    expect(applyEma(null, 152, 0.3)).toBe(152);
  });

  it('normalizes initial reading into [0, 360)', () => {
    expect(applyEma(null, 365, 0.3)).toBe(5);
    expect(applyEma(null, -10, 0.3)).toBe(350);
  });

  it('moves toward raw by alpha fraction', () => {
    // prev=100, raw=200, alpha=0.3 → 100 + 0.3*100 = 130
    expect(applyEma(100, 200, 0.3)).toBeCloseTo(130, 5);
  });

  it('takes the short arc across the 360/0 wrap', () => {
    // prev=350, raw=10 → short arc is +20 (clockwise), not -340
    // 350 + 0.5*20 = 360 → wrapped to 0
    expect(applyEma(350, 10, 0.5)).toBeCloseTo(0, 5);

    // prev=10, raw=350 → short arc is -20 (CCW), not +340
    // 10 + 0.5*(-20) = 0 → 0
    expect(applyEma(10, 350, 0.5)).toBeCloseTo(0, 5);
  });

  it('converges asymptotically when raw is constant', () => {
    let v: number | null = 100;
    for (let i = 0; i < 30; i++) v = applyEma(v, 152, 0.3);
    expect(v).toBeCloseTo(152, 1);
  });

  it('alpha=1 means no smoothing', () => {
    expect(applyEma(50, 152, 1)).toBe(152);
  });

  it('alpha=0.3 reaches |delta|<3° within ~10 readings of a 50° step', () => {
    let v: number | null = 100;
    let readings = 0;
    while (Math.abs((v ?? 0) - 150) >= 3 && readings < 50) {
      v = applyEma(v, 150, 0.3);
      readings++;
    }
    // alpha=0.3 should take ~9 readings; alpha=0.15 needed ~18
    expect(readings).toBeLessThanOrEqual(10);
  });
});

describe('headingSmoothingAlphaForPlatform', () => {
  it('smooths Android more strongly (lower alpha) since its raw azimuth is unfiltered/noisy', () => {
    const alpha = headingSmoothingAlphaForPlatform('android', 0.3);
    expect(alpha).toBe(0.2);
    expect(alpha).toBeLessThan(1); // must NOT bypass EMA (that caused on-device jitter)
  });

  it('keeps the configured smoothing alpha on iOS', () => {
    expect(headingSmoothingAlphaForPlatform('ios', 0.3)).toBe(0.3);
  });
});

describe('signedDelta', () => {
  it('returns 0 for identical headings', () => {
    expect(signedDelta(152, 152)).toBe(0);
  });

  it('returns positive when a is clockwise of b', () => {
    expect(signedDelta(160, 152)).toBe(8);
  });

  it('returns negative when a is counter-clockwise of b', () => {
    expect(signedDelta(144, 152)).toBe(-8);
  });

  it('takes the short arc near 0/360', () => {
    expect(signedDelta(10, 350)).toBe(20);
    expect(signedDelta(350, 10)).toBe(-20);
  });

  it('returns +180 (not -180) for opposite headings', () => {
    expect(signedDelta(180, 0)).toBe(180);
  });

  it('result is always in (−180, 180]', () => {
    for (let a = 0; a < 360; a += 17) {
      for (let b = 0; b < 360; b += 23) {
        const d = signedDelta(a, b);
        expect(d).toBeGreaterThan(-180);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('shortestRotationDelta', () => {
  it('returns 0 when current already equals target', () => {
    expect(shortestRotationDelta(-152, -152)).toBe(0);
  });

  it('takes the short arc when crossing the 0/360 seam (the N-seam compass bug)', () => {
    // Without this helper, animating between roseRotation = -359 and -1 would tween
    // through -200, -100 etc — visually a near-full rotation in the wrong direction.
    // The shortest delta is -2 (so accumulated value goes -359 → -361, visually = -1).
    expect(shortestRotationDelta(-359, -1)).toBe(-2);
    expect(shortestRotationDelta(-1, -359)).toBe(2);
  });

  it('preserves accumulated rotation: result + current is angularly equivalent to target', () => {
    for (let current = -1080; current <= 1080; current += 47) {
      for (let target = -360; target <= 0; target += 23) {
        const d = shortestRotationDelta(current, target);
        const result = ((current + d) % 360 + 360) % 360;
        const expected = ((target % 360) + 360) % 360;
        expect(result).toBeCloseTo(expected, 5);
      }
    }
  });

  it('result is always in (−180, 180]', () => {
    for (let current = -720; current <= 720; current += 31) {
      for (let target = -360; target <= 0; target += 17) {
        const d = shortestRotationDelta(current, target);
        expect(d).toBeGreaterThan(-180);
        expect(d).toBeLessThanOrEqual(180);
      }
    }
  });

  it('chooses +180 (not -180) for an exact half-turn', () => {
    expect(shortestRotationDelta(0, 180)).toBe(180);
  });
});

describe('shouldPublishHeadingUpdate', () => {
  it('suppresses tiny burst updates before the publish interval', () => {
    expect(
      shouldPublishHeadingUpdate({
        previousHeading: 120,
        nextHeading: 120.4,
        elapsedMs: 8,
        minIntervalMs: 33,
        minDeltaDeg: 2,
        minIdleDeltaDeg: 0.5,
      }),
    ).toBe(false);
  });

  it('publishes large changes immediately so fast turns do not lag behind', () => {
    expect(
      shouldPublishHeadingUpdate({
        previousHeading: 120,
        nextHeading: 124,
        elapsedMs: 8,
        minIntervalMs: 33,
        minDeltaDeg: 2,
        minIdleDeltaDeg: 0.5,
      }),
    ).toBe(true);
  });

  it('does NOT publish stationary noise even past the interval (no idle re-render churn)', () => {
    // 0.4° drift < idle threshold: the phone is effectively still, so re-rendering the
    // whole screen to show an identical heading is wasted work even though 33ms elapsed.
    expect(
      shouldPublishHeadingUpdate({
        previousHeading: 120,
        nextHeading: 120.4,
        elapsedMs: 33,
        minIntervalMs: 33,
        minDeltaDeg: 2,
        minIdleDeltaDeg: 0.5,
      }),
    ).toBe(false);
  });

  it('publishes real slow rotation at the interval (above the idle gate, below the immediate delta)', () => {
    // 0.8° change is real movement (> idle 0.5°) but < minDeltaDeg: the interval gate lets
    // the readout track a slow turn.
    expect(
      shouldPublishHeadingUpdate({
        previousHeading: 120,
        nextHeading: 120.8,
        elapsedMs: 33,
        minIntervalMs: 33,
        minDeltaDeg: 2,
        minIdleDeltaDeg: 0.5,
      }),
    ).toBe(true);
  });
});

describe('nextRoseRotation', () => {
  it('advances the target along the shortest signed arc toward -heading', () => {
    expect(nextRoseRotation(0, 10)).toBe(-10);
    expect(nextRoseRotation(-10, 20)).toBe(-20);
  });

  it('returns the previous target unchanged when the heading has not moved', () => {
    // -10 is the target for heading 10; the same heading must produce delta 0.
    expect(nextRoseRotation(-10, 10)).toBe(-10);
  });

  it('takes the SHORT way across the 0/360 seam (forward 359 -> 1)', () => {
    const t1 = nextRoseRotation(0, 359);
    const t2 = nextRoseRotation(t1, 1);
    expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(2 + 1e-9); // ~2°, NOT ~358° the long way
  });

  it('takes the SHORT way across the 0/360 seam (backward 1 -> 359)', () => {
    const t1 = nextRoseRotation(0, 1);
    const t2 = nextRoseRotation(t1, 359);
    expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(2 + 1e-9);
  });

  it('keeps the normalized visual rotation equal to -heading over a sequence, never jumping the long way', () => {
    let target = 0;
    for (const heading of [10, 80, 170, 300, 359, 1, 90, 180, 181, 0]) {
      const next = nextRoseRotation(target, heading);
      // Each step moves at most a half-turn (shortest arc).
      expect(Math.abs(next - target)).toBeLessThanOrEqual(180 + 1e-9);
      // The rose's visual angle (target mod 360) always renders -heading.
      expect(normalizeDeg(-next)).toBeCloseTo(normalizeDeg(heading), 5);
      target = next;
    }
  });
});

describe('roseSpringConfig', () => {
  // A2 regression fix: re-targeting a RUNNING reanimated spring inherits its live velocity
  // (confirmed via Reanimated docs). At ~30Hz that velocity hands off frame-to-frame, so when
  // the heading stream stalls the rose can coast/overshoot past the frozen target — the
  // on-device "döndürmeyi bıraktım hâlâ döndü". The config must therefore be physically
  // incapable of overshoot: non-oscillating (zeta >= 1) AND overshoot hard-clamped.
  const zeta = (c: { mass: number; stiffness: number; damping: number }): number =>
    c.damping / (2 * Math.sqrt(c.stiffness * c.mass));

  it('is overdamped or critically damped (zeta >= 1) so it never oscillates/overshoots', () => {
    expect(zeta(roseSpringConfig())).toBeGreaterThanOrEqual(1);
  });

  it('hard-clamps overshoot so inherited spring velocity cannot coast past the target on a stall', () => {
    expect(roseSpringConfig().overshootClamping).toBe(true);
  });
});

describe('roseFollowStep', () => {
  // The UI-thread rose driver. Each vsync the displayed angle eases a fraction toward the
  // accumulated target. Replaces the per-sample withSpring retarget so the rose advances
  // EVERY frame (freeze -> graceful glide) regardless of when sparse sensor samples land.
  const FRAME = 1 / 60; // 16.6ms

  // The app calls roseFollowStep with EXPLICIT lambda + maxDt — a worklet can't reliably capture
  // cross-module imported constants into its closure (on-device this threw a ReferenceError), so
  // the constants are passed in from the caller. Mirror that here, defaulting lambda to the prod value.
  const step = (
    displayed: number,
    target: number,
    dtSec: number,
    lambda: number = ROSE_FOLLOW_LAMBDA,
  ): number => roseFollowStep(displayed, target, dtSec, lambda, ROSE_FOLLOW_MAX_DT_SEC);

  it('moves toward the target but NEVER overshoots, for any dt (no-coast guard / A2 regression)', () => {
    // overshootClamping-by-construction: the eased fraction is in [0,1), so the result is
    // always on the segment [displayed, target]. Property-check across a wide dt range.
    const cases: [number, number][] = [
      [0, 60],
      [60, 0],
      [-200, 35],
      [100, 100],
    ];
    for (const [d, t] of cases) {
      for (const dt of [0.0001, FRAME, 0.05, 0.5, 2, 100]) {
        const next = step(d, t, dt);
        const lo = Math.min(d, t);
        const hi = Math.max(d, t);
        expect(next).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(next).toBeLessThanOrEqual(hi + 1e-9);
        // monotonic toward target (never the wrong way)
        if (t > d) expect(next).toBeGreaterThanOrEqual(d - 1e-9);
        if (t < d) expect(next).toBeLessThanOrEqual(d + 1e-9);
      }
    }
  });

  it('is exactly frame-rate independent: one full frame == two half frames', () => {
    // Exponential decay is multiplicative, so 60/90/120Hz panels converge identically —
    // the property that lets us ship one tuning to all devices/stores.
    const oneStep = step(0, 90, FRAME);
    const halfA = step(0, 90, FRAME / 2);
    const halfB = step(halfA, 90, FRAME / 2);
    expect(halfB).toBeCloseTo(oneStep, 6);
  });

  it('clamps dt so a long background/foreground gap cannot snap the rose past target', () => {
    // A huge dt is clamped to ROSE_FOLLOW_MAX_DT_SEC: it advances at most that fraction,
    // never a giant jump, and never past target.
    const huge = step(0, 90, 5);
    const clamped = step(0, 90, ROSE_FOLLOW_MAX_DT_SEC);
    expect(huge).toBeCloseTo(clamped, 9);
    expect(huge).toBeLessThan(90); // a fraction, not a snap to target
  });

  it('advances a meaningful fraction on a normal frame (the rose is NOT frozen)', () => {
    // A 60° gap must visibly move within a single 16.6ms frame — this is the inverse of
    // the bug (rose sitting still for ~1s). With lambda~9, one frame moves ~13-14%.
    const next = step(0, 60, FRAME);
    expect(next).toBeGreaterThan(60 * 0.05);
  });

  it('converges to within ~0.05° of a 60° target within ~1s of frames', () => {
    let v = 0;
    let frames = 0;
    while (Math.abs(60 - v) > 0.05 && frames < 120) {
      v = step(v, 60, FRAME);
      frames++;
    }
    expect(Math.abs(60 - v)).toBeLessThanOrEqual(0.05);
    expect(frames).toBeLessThanOrEqual(70); // ~7τ at λ=9 ≈ 0.8s
  });

  it('tracks a continuous SLOW rotation without starving (the freeze, as a property)', () => {
    // Simulate fine qibla alignment: the target ramps ~0.3°/frame-ish slowly. The displayed
    // value must keep advancing every frame and stay within a small bounded lag — never the
    // ~1s stall the displacement gate produced.
    let displayed = 0;
    let target = 0;
    const advances: number[] = [];
    for (let i = 0; i < 120; i++) {
      target += 0.25; // continuous slow rotation
      const next = step(displayed, target, FRAME);
      advances.push(next - displayed);
      displayed = next;
    }
    // After the initial catch-up, EVERY frame advances (> 0) — no frozen frames.
    const steady = advances.slice(30);
    expect(steady.every((a) => a > 0)).toBe(true);
    // And the rose stays within a small lag of the moving target (bounded, smooth follow).
    expect(target - displayed).toBeLessThan(2);
  });

  it('uses ROSE_FOLLOW_LAMBDA as the default rate', () => {
    expect(step(0, 90, FRAME)).toBeCloseTo(step(0, 90, FRAME, ROSE_FOLLOW_LAMBDA), 9);
  });
});

describe('isInterference', () => {
  it('returns false when there is no field reading (iOS / absent)', () => {
    expect(isInterference(null, 48)).toBe(false);
    expect(isInterference(0, 48)).toBe(false);
    expect(isInterference(NaN, 48)).toBe(false);
  });

  it('flags |B| far from the expected geomagnetic intensity (on-device desk case)', () => {
    expect(isInterference(190, 48)).toBe(true);
    expect(isInterference(128, 48)).toBe(true);
  });

  it('passes |B| close to the expected intensity (clean, held in the air)', () => {
    expect(isInterference(41, 48)).toBe(false);
    expect(isInterference(48, 48)).toBe(false);
  });

  it('uses the FIELD_TOLERANCE_UT boundary (strict greater-than)', () => {
    expect(isInterference(48 + 20, 48)).toBe(false);
    expect(isInterference(48 + 21, 48)).toBe(true);
  });

  it('falls back to absolute sanity bounds when the expected intensity is unknown', () => {
    expect(isInterference(41, null)).toBe(false);
    expect(isInterference(190, null)).toBe(true);
    expect(isInterference(10, null)).toBe(true);
  });
});

describe('resolveHeadingReliability (android)', () => {
  const android = 'android' as const;

  it('is high + no reason for a clean, calibrated reading', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 3, magAccuracy: 3, interference: false },
      android,
    );
    expect(r.quality).toBe('high');
    expect(r.reason).toBeNull();
  });

  it('flags INTERFERENCE even when the fused accuracy reads high (the desk case)', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 3, magAccuracy: 3, interference: true },
      android,
    );
    expect(r.quality).toBe('unreliable');
    expect(r.reason).toBe('interference');
  });

  it('flags CALIBRATE when the RAW magnetometer is uncalibrated though the fused accuracy is high', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 3, magAccuracy: 0, interference: false },
      android,
    );
    expect(r.quality).toBe('unreliable');
    expect(r.reason).toBe('calibrate');
  });

  it('prioritises calibrate over interference for a truly uncalibrated sensor', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 0, magAccuracy: 0, interference: true },
      android,
    );
    expect(r.reason).toBe('calibrate');
  });

  it('takes the worse of rotation-vector and magnetometer accuracy', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 3, magAccuracy: 1, interference: false },
      android,
    );
    expect(r.quality).toBe('medium');
    expect(r.reason).toBe('calibrate');
  });

  it('falls back to the primary accuracy when the magnetometer reading is absent', () => {
    const r = resolveHeadingReliability(
      { primaryAccuracy: 3, magAccuracy: null, interference: false },
      android,
    );
    expect(r.quality).toBe('high');
    expect(r.reason).toBeNull();
  });
});

describe('resolveHeadingReliability (ios)', () => {
  it('maps the CLHeading accuracy band and never runs the field gate', () => {
    const good = resolveHeadingReliability(
      { primaryAccuracy: 5, magAccuracy: null, interference: false },
      'ios',
    );
    expect(good.quality).toBe('high');
    expect(good.reason).toBeNull();

    const uncalibrated = resolveHeadingReliability(
      { primaryAccuracy: -1, magAccuracy: null, interference: false },
      'ios',
    );
    expect(uncalibrated.quality).toBe('unknown');
    expect(uncalibrated.reason).toBe('calibrate');
  });
});
