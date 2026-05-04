import {
  classifyQuality,
  isUnreliable,
  normalizeAccuracyForPlatform,
  showAlignmentVisuals,
} from '@/utils/heading';

describe('classifyQuality', () => {
  it('returns "unknown" when accuracy is null', () => {
    expect(classifyQuality(null)).toBe('unknown');
  });

  it('returns "high" when accuracy is within goodMaxDeg', () => {
    expect(classifyQuality(15)).toBe('high');
  });

  it('returns "medium" when accuracy is within warnMaxDeg', () => {
    expect(classifyQuality(30)).toBe('medium');
  });

  it('returns "low" when accuracy is within lowMaxDeg', () => {
    expect(classifyQuality(50)).toBe('low');
  });

  it('returns "unreliable" when accuracy exceeds lowMaxDeg', () => {
    expect(classifyQuality(80)).toBe('unreliable');
  });
});

describe('isUnreliable', () => {
  it('treats "unknown" as unreliable so we never show a misleading needle', () => {
    expect(isUnreliable('unknown')).toBe(true);
  });

  it('treats "unreliable" as unreliable', () => {
    expect(isUnreliable('unreliable')).toBe(true);
  });

  it('does not treat "high" as unreliable', () => {
    expect(isUnreliable('high')).toBe(false);
  });

  it('does not treat "medium" or "low" as unreliable (banner suffices)', () => {
    expect(isUnreliable('medium')).toBe(false);
    expect(isUnreliable('low')).toBe(false);
  });
});

describe('normalizeAccuracyForPlatform', () => {
  it('returns null for null/undefined input', () => {
    expect(normalizeAccuracyForPlatform(null, 'ios')).toBeNull();
    expect(normalizeAccuracyForPlatform(undefined, 'android')).toBeNull();
  });

  it('returns null for the iOS uncalibrated sentinel (-1)', () => {
    expect(normalizeAccuracyForPlatform(-1, 'ios')).toBeNull();
  });

  it('passes iOS degree readings through unchanged', () => {
    expect(normalizeAccuracyForPlatform(12.5, 'ios')).toBe(12.5);
  });

  it('maps Android SENSOR_STATUS_UNRELIABLE (0) to a high-degree value so quality is "unreliable"', () => {
    // Bug K3c: Android's sensor accuracy 0 means SENSOR_STATUS_UNRELIABLE, not "0 degrees of error".
    // We force a value above lowMaxDeg so classifyQuality returns 'unreliable'.
    const value = normalizeAccuracyForPlatform(0, 'android');
    expect(value).not.toBeNull();
    expect(classifyQuality(value)).toBe('unreliable');
  });

  it('maps Android SENSOR_STATUS_ACCURACY_HIGH (3) to ~5°', () => {
    expect(normalizeAccuracyForPlatform(3, 'android')).toBe(5);
  });

  it('maps Android SENSOR_STATUS_ACCURACY_MEDIUM (2) to ~15°', () => {
    expect(normalizeAccuracyForPlatform(2, 'android')).toBe(15);
  });

  it('maps Android SENSOR_STATUS_ACCURACY_LOW (1) to ~30°', () => {
    expect(normalizeAccuracyForPlatform(1, 'android')).toBe(30);
  });
});

describe('showAlignmentVisuals (K3b)', () => {
  it('hides halo + ring when unreliable, even if aligned latched true', () => {
    expect(showAlignmentVisuals(true, true)).toBe(false);
  });

  it('shows halo + ring when aligned and reading is reliable', () => {
    expect(showAlignmentVisuals(true, false)).toBe(true);
  });

  it('hides halo + ring when not aligned', () => {
    expect(showAlignmentVisuals(false, false)).toBe(false);
    expect(showAlignmentVisuals(false, true)).toBe(false);
  });
});
