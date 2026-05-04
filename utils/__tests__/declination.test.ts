import {
  applyDeclinationToHeading,
  computeMagneticDeclination,
  selectHeadingSource,
} from '@/utils/declination';

describe('applyDeclinationToHeading', () => {
  it('returns the same heading when declination is zero', () => {
    expect(applyDeclinationToHeading(123, 0)).toBeCloseTo(123, 6);
  });

  it('adds positive (east) declination — true heading is east of magnetic', () => {
    // Magnetic heading = 0 (pointing magnetic north), declination = +10 east →
    // true heading is 10° (you are actually facing 10° east of true north).
    expect(applyDeclinationToHeading(0, 10)).toBeCloseTo(10, 6);
  });

  it('subtracts negative (west) declination', () => {
    expect(applyDeclinationToHeading(20, -10)).toBeCloseTo(10, 6);
  });

  it('wraps below 0 to [0, 360)', () => {
    expect(applyDeclinationToHeading(5, -10)).toBeCloseTo(355, 6);
  });

  it('wraps at/above 360 to [0, 360)', () => {
    expect(applyDeclinationToHeading(355, 10)).toBeCloseTo(5, 6);
  });
});

describe('computeMagneticDeclination (NOAA WMM contract)', () => {
  // Reference date inside the WMM 2025 model window (valid 2024-11-13 → 2029-11-13).
  const referenceDate = new Date('2026-05-01T00:00:00Z');

  // Magnitude/sign sanity bounds — wide enough to absorb model updates, tight
  // enough to catch a sign flip or wildly wrong coordinates.
  const cities: { name: string; lat: number; lon: number; min: number; max: number }[] = [
    { name: 'Istanbul', lat: 41.0082, lon: 28.9784, min: 4, max: 9 },
    { name: 'New York', lat: 40.7128, lon: -74.006, min: -16, max: -10 },
    { name: 'Los Angeles', lat: 34.0522, lon: -118.2437, min: 8, max: 13 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093, min: 10, max: 14 },
    { name: 'Anchorage', lat: 61.2181, lon: -149.9003, min: 12, max: 18 },
    { name: 'Mecca', lat: 21.4225, lon: 39.8262, min: 2, max: 6 },
    { name: 'Jakarta', lat: -6.2088, lon: 106.8456, min: -1, max: 2 },
  ];

  it.each(cities)(
    'returns declination within physically plausible bounds for $name',
    ({ lat, lon, min, max }) => {
      const decl = computeMagneticDeclination(lat, lon, referenceDate);
      expect(decl).not.toBeNull();
      expect(decl as number).toBeGreaterThanOrEqual(min);
      expect(decl as number).toBeLessThanOrEqual(max);
    },
  );

  it('is finite at the equator', () => {
    const decl = computeMagneticDeclination(0, 0, referenceDate);
    expect(Number.isFinite(decl as number)).toBe(true);
  });
});

describe('selectHeadingSource', () => {
  const date = new Date('2026-05-01T00:00:00Z');

  it('uses trueHeading directly when available, regardless of location', () => {
    const result = selectHeadingSource({
      trueHeading: 120,
      magHeading: 130,
      location: null,
      date,
    });
    expect(result).toEqual({ heading: 120, source: 'true' });
  });

  it('falls back to raw magnetic when no location is provided (no decl available)', () => {
    const result = selectHeadingSource({
      trueHeading: -1,
      magHeading: 130,
      location: null,
      date,
    });
    expect(result).toEqual({ heading: 130, source: 'magnetic' });
  });

  it('applies WMM declination to magHeading when trueHeading missing and location known', () => {
    // NYC: declination ≈ -12.7° in 2026. Mag heading 130 → true heading ≈ 117.3°.
    const result = selectHeadingSource({
      trueHeading: -1,
      magHeading: 130,
      location: { lat: 40.7128, lon: -74.006 },
      date,
    });
    if (result === null) throw new Error('expected a heading');
    expect(result.source).toBe('true');
    // Wide bound — exact value depends on WMM model version.
    expect(result.heading).toBeGreaterThan(113);
    expect(result.heading).toBeLessThan(121);
  });

  it('returns null result when neither true nor magnetic heading is valid', () => {
    const result = selectHeadingSource({
      trueHeading: -1,
      magHeading: -1,
      location: null,
      date,
    });
    expect(result).toBeNull();
  });
});
