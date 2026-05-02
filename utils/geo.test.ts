import { distanceToKaabaKm, qiblaBearing } from './geo';

describe('qiblaBearing', () => {
  // Reference values cross-checked against IslamicFinder + qiblafinder.com.
  // Tolerance ±0.5° for the math (sensor tolerance is separate).
  it.each([
    { city: 'Istanbul', lat: 41.0082, lon: 28.9784, expected: 151.7 },
    { city: 'New York', lat: 40.7128, lon: -74.006, expected: 58.5 },
    { city: 'Jakarta', lat: -6.2088, lon: 106.8456, expected: 295.1 },
    { city: 'Sydney', lat: -33.8688, lon: 151.2093, expected: 277.5 },
    { city: 'London', lat: 51.5074, lon: -0.1278, expected: 118.99 },
    { city: 'Cairo', lat: 30.0444, lon: 31.2357, expected: 136.14 },
  ])('returns $expected° for $city', ({ lat, lon, expected }) => {
    const actual = qiblaBearing(lat, lon);
    expect(Math.abs(actual - expected)).toBeLessThan(0.5);
  });

  it('returns a value in [0, 360)', () => {
    const result = qiblaBearing(0, 0);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
  });

  it('handles anti-meridian crossing (lon ≈ 180)', () => {
    const result = qiblaBearing(0, 179.9);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('handles anti-meridian crossing (lon ≈ -180)', () => {
    const result = qiblaBearing(0, -179.9);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(360);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('distanceToKaabaKm', () => {
  // Reference values cross-checked against distance.to / prokerala / travelmath
  // (great-circle distance, R = 6371 km). Original spec values for Istanbul (2470)
  // and Sydney (12200) were off by 2.6%/8.5% respectively — confirmed against
  // multiple authoritative sources that the corrected values below are right.
  it.each([
    { city: 'Istanbul', lat: 41.0082, lon: 28.9784, expected: 2405 },
    { city: 'New York', lat: 40.7128, lon: -74.006, expected: 10306 },
    { city: 'Sydney', lat: -33.8688, lon: 151.2093, expected: 13236 },
  ])('returns ~$expected km for $city', ({ lat, lon, expected }) => {
    const actual = distanceToKaabaKm(lat, lon);
    // 1% tolerance for Earth-radius approximation differences across references.
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);
  });

  it('returns 0 at the Kaaba itself', () => {
    expect(distanceToKaabaKm(21.4225, 39.8262)).toBeLessThan(0.001);
  });
});
