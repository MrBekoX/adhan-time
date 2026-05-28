import {
  applyEma,
  shouldPublishHeadingUpdate,
  shortestRotationDelta,
  signedDelta,
} from './heading';

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
      }),
    ).toBe(true);
  });

  it('publishes at the interval even when movement is small', () => {
    expect(
      shouldPublishHeadingUpdate({
        previousHeading: 120,
        nextHeading: 120.4,
        elapsedMs: 33,
        minIntervalMs: 33,
        minDeltaDeg: 2,
      }),
    ).toBe(true);
  });
});
