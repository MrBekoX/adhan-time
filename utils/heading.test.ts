import {
  applyEma,
  headingSmoothingAlphaForPlatform,
  nextRoseRotation,
  roseTweenDurationMs,
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

describe('roseTweenDurationMs', () => {
  it('keeps large phone turns responsive (shortest, no trailing)', () => {
    expect(roseTweenDurationMs(90)).toBeLessThanOrEqual(90);
    expect(roseTweenDurationMs(90)).toBeLessThanOrEqual(roseTweenDurationMs(2));
  });

  it('uses a short tween for small steps — the fused stream is continuous (no 200ms gaps to bridge)', () => {
    // The native rotation-vector / CLHeading stream arrives ~every 20ms, so small per-sample
    // deltas no longer need a long bridging tween; a short one just interpolates between
    // already-close samples without adding lag.
    expect(roseTweenDurationMs(2)).toBeLessThanOrEqual(120);
  });
});
