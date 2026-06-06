import { makeCircularOneEuro } from '../oneEuroFilter';

const P = { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 };
const DT = 1 / 30;

function feed(f: { filter: (a: number, t: number) => number }, seq: number[], dt = DT) {
  let t = 0;
  let out = 0;
  for (const a of seq) {
    t += dt;
    out = f.filter(a, t);
  }
  return out;
}

describe('makeCircularOneEuro', () => {
  it('converges to a constant input with no steady-state bias', () => {
    const f = makeCircularOneEuro(P);
    const out = feed(f, Array(120).fill(137));
    expect(out).toBeCloseTo(137, 1);
  });

  it('rejects idle jitter (output band far tighter than input band)', () => {
    const f = makeCircularOneEuro(P);
    // ±1.5° alternating noise around 100° — low-end magnetometer idle.
    const noisy = Array.from({ length: 120 }, (_, i) => 100 + (i % 2 === 0 ? 1.5 : -1.5));
    const out = feed(f, noisy);
    expect(Math.abs(out - 100)).toBeLessThan(0.5);
  });

  it('tracks a fast sweep to the target without permanent lag', () => {
    const f = makeCircularOneEuro(P);
    // 0 -> 90 over 10 samples (270°/s), then hold at 90 for 30 samples.
    const ramp = Array.from({ length: 10 }, (_, i) => (i + 1) * 9);
    const hold = Array(30).fill(90);
    const out = feed(f, [...ramp, ...hold]);
    expect(out).toBeCloseTo(90, 0);
  });

  it('handles the 0/360 seam (359 -> 1 stays near 0, never ~180)', () => {
    const f = makeCircularOneEuro(P);
    // Small +2° motion across the seam, repeated so it settles near 0.
    const seq = [359, 1, 359, 1, 0, 0, 0, 0, 0, 0];
    const out = feed(f, seq);
    const distToZero = Math.min(out, 360 - out);
    expect(distToZero).toBeLessThan(3);
  });

  it('is ~frame-rate independent (60Hz double-steps match 30Hz over equal time)', () => {
    const at30 = makeCircularOneEuro(P);
    const at60 = makeCircularOneEuro(P);
    // Same 90°/s motion over 1s: 30 samples @ 3°/step vs 60 samples @ 1.5°/step.
    const out30 = feed(at30, Array.from({ length: 30 }, (_, i) => (i + 1) * 3), 1 / 30);
    const out60 = feed(at60, Array.from({ length: 60 }, (_, i) => (i + 1) * 1.5), 1 / 60);
    expect(Math.abs(out30 - out60)).toBeLessThan(2);
  });

  it('ignores a NaN sample (returns last good value)', () => {
    const f = makeCircularOneEuro(P);
    feed(f, Array(30).fill(50));
    const out = f.filter(NaN, 2);
    expect(out).toBeCloseTo(50, 1);
  });
});
