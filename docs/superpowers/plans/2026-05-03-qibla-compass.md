# Qibla Compass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a religiously accurate Qibla compass tab that uses device GPS + heading sensor to point toward the Kaaba.

**Architecture:** Pure-math layer (`utils/geo.ts`) computes great-circle initial bearing and haversine distance from user → Kaaba. Two sensor hooks (`useUserLocation`, `useDeviceHeading`) wrap `expo-location` and normalize platform-specific accuracy values. Presentational components (`QiblaCompass`, `CompassRose`, `CalibrationBanner`) render the dial. The screen `app/(tabs)/qibla.tsx` composes them and handles permission flow.

**Tech Stack:** React Native (Expo SDK 54), `expo-location` (new), `react-native-reanimated` v4 (already installed), TypeScript strict, jest-expo, i18next.

**Spec:** `docs/superpowers/specs/2026-05-03-qibla-compass-design.md`

**Conventions (from CLAUDE.md):**
- No `Co-Authored-By` trailers in commits
- Conventional Commits — `feat(qibla): ...`, `test(qibla): ...`, `chore(qibla): ...`
- Pre-commit (husky) runs `eslint --fix` + `prettier`. Pre-push runs `tsc --noEmit` + `expo doctor`. Hook bypass forbidden.
- No literal user-facing strings in code (all i18n)
- No `any`, no silent `catch {}`
- Use `@/utils/logger` not `console.log`

---

## Task 1: Install expo-location and configure native permission

**Files:**
- Modify: `D:/adhan-time/package.json`
- Modify: `D:/adhan-time/app.json`

- [ ] **Step 1: Install expo-location with version compat resolution**

Run:
```bash
npx expo install expo-location
```

Expected: adds `expo-location` to `dependencies` in `package.json` (compatible with SDK 54).

- [ ] **Step 2: Add expo-location plugin to app.json with usage description**

Modify `D:/adhan-time/app.json`. Replace the entire `plugins` array with:

```json
"plugins": [
  "expo-router",
  [
    "expo-notifications",
    {
      "color": "#10B981"
    }
  ],
  "expo-localization",
  [
    "expo-location",
    {
      "locationWhenInUsePermission": "Adhan Time needs your location to compute the Qibla direction (toward the Kaaba) and show the bearing on a compass."
    }
  ]
]
```

This injects `NSLocationWhenInUseUsageDescription` into iOS Info.plist and adds `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` to Android manifest at prebuild time.

- [ ] **Step 3: Regenerate native folders (prebuild)**

Run:
```bash
npx expo prebuild --clean
```

Expected: `ios/` and `android/` directories regenerated. The Info.plist contains the new usage key; `AndroidManifest.xml` contains the location permissions.

- [ ] **Step 4: Verify type check still passes**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json ios android
git commit -m "chore(qibla): add expo-location dependency and permission config"
```

---

## Task 2: Add Kaaba coordinate constants

**Files:**
- Create: `D:/adhan-time/constants/qibla.ts`

- [ ] **Step 1: Create constants/qibla.ts**

```ts
// D:/adhan-time/constants/qibla.ts
/**
 * Coordinates of the Kaaba (Hacer-ül Esved corner) — Diyanet / IslamicFinder consensus.
 * Source documented in docs/superpowers/specs/2026-05-03-qibla-compass-design.md §5.
 */
export const KAABA = {
  lat: 21.4225,
  lon: 39.8262,
} as const;

/**
 * Heading accuracy thresholds in degrees (iOS scale; Android levels are normalized to this).
 * See spec §6 "Accuracy thresholds".
 */
export const HEADING_ACCURACY = {
  /** ≤ this → quality 'high'. */
  goodMaxDeg: 20,
  /** ≤ this → quality 'medium'. Above goodMaxDeg surfaces the calibration banner. */
  warnMaxDeg: 35,
  /** ≤ this → quality 'low'. Above this → 'unreliable' (needle red, distance dim). */
  lowMaxDeg: 60,
} as const;

/** Inside this radius around the Kaaba we suppress bearing display. */
export const AT_KAABA_RADIUS_KM = 0.1;

/** Low-pass filter coefficient for heading smoothing. Higher = more responsive, lower = smoother. */
export const HEADING_EMA_ALPHA = 0.15;
```

- [ ] **Step 2: Verify type check**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add constants/qibla.ts
git commit -m "feat(qibla): add Kaaba coordinate and accuracy threshold constants"
```

---

## Task 3: Write geo utility tests (RED)

**Files:**
- Create: `D:/adhan-time/utils/geo.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// D:/adhan-time/utils/geo.test.ts
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
  it.each([
    { city: 'Istanbul', lat: 41.0082, lon: 28.9784, expected: 2470 },
    { city: 'New York', lat: 40.7128, lon: -74.006, expected: 10310 },
    { city: 'Sydney', lat: -33.8688, lon: 151.2093, expected: 12200 },
  ])('returns ~$expected km for $city', ({ lat, lon, expected }) => {
    const actual = distanceToKaabaKm(lat, lon);
    // 1% tolerance for Earth-radius approximation differences across references.
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01);
  });

  it('returns 0 at the Kaaba itself', () => {
    expect(distanceToKaabaKm(21.4225, 39.8262)).toBeLessThan(0.001);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (no implementation yet)**

Run:
```bash
npx jest utils/geo.test.ts
```

Expected: FAIL — "Cannot find module './geo'" or similar.

---

## Task 4: Implement geo utilities (GREEN)

**Files:**
- Create: `D:/adhan-time/utils/geo.ts`

- [ ] **Step 1: Implement geo.ts**

```ts
// D:/adhan-time/utils/geo.ts
import { KAABA } from '@/constants/qibla';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Initial bearing (forward azimuth) from (lat, lon) to the Kaaba, in degrees clockwise from
 * geographic north. Result is in [0, 360).
 */
export function qiblaBearing(lat: number, lon: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (toDeg(θ) + 360) % 360;
}

/**
 * Great-circle distance from (lat, lon) to the Kaaba, in kilometres (haversine formula,
 * mean Earth radius 6371 km).
 */
export function distanceToKaabaKm(lat: number, lon: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δφ = toRad(KAABA.lat - lat);
  const Δλ = toRad(KAABA.lon - lon);

  const sinΔφ2 = Math.sin(Δφ / 2);
  const sinΔλ2 = Math.sin(Δλ / 2);
  const a = sinΔφ2 * sinΔφ2 + Math.cos(φ1) * Math.cos(φ2) * sinΔλ2 * sinΔλ2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
npx jest utils/geo.test.ts
```

Expected: PASS — all 11 tests green.

- [ ] **Step 3: Type check**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4: Lint**

Run:
```bash
npm run lint -- utils/geo.ts utils/geo.test.ts
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add utils/geo.ts utils/geo.test.ts
git commit -m "feat(qibla): add great-circle bearing and haversine distance utilities"
```

---

## Task 5: Add i18n keys for qibla screen

**Files:**
- Modify: `D:/adhan-time/locales/tr.json`
- Modify: `D:/adhan-time/locales/en.json`

- [ ] **Step 1: Add qibla keys to tr.json**

Modify `D:/adhan-time/locales/tr.json`. Replace the `screens` block to include a new `qibla` sub-object. Insert this new entry inside `screens` (after `settings`, before `placeholder`):

```json
    "qibla": {
      "tabLabel": "Kıble",
      "eyebrow": "kıble",
      "bearingLabel": "Yön",
      "distanceLabel": "Mesafe",
      "statusLocation": "Konum: ±{{meters}} m",
      "statusCompass": "Pusula: ±{{degrees}}°",
      "statusCompassUnknown": "Pusula: kalibre ediliyor",
      "atKaaba": "Kabe'desin",
      "permissionTitle": "Konum izni gerekli",
      "permissionBody": "Kıble yönünü göstermek için cihazın konumuna ihtiyacımız var.",
      "openSettings": "Ayarları aç",
      "locationServicesOff": "Konum servisleri kapalı. Lütfen sistem ayarlarından aç.",
      "acquiringLocation": "Konum alınıyor",
      "sensorMissing": "Bu cihazda pusula sensörü bulunmuyor.",
      "headingFallbackNote": "Hassas konum izni verirseniz daha doğru gösterilebilir.",
      "calibrationTitle": "Pusula kalibrasyonu",
      "calibrationBody": "Telefonu havada 8 hareketi çiz.",
      "calibrationUnreliable": "Pusula güvenilir değil — etrafında metal/elektronik cihaz var mı?"
    },
```

Also add to `units` block (replace existing `units` to include km/degrees/meters):

```json
  "units": {
    "hour_one": "{{count}} saat",
    "hour_other": "{{count}} saat",
    "minute_one": "{{count}} dakika",
    "minute_other": "{{count}} dakika",
    "km": "{{value}} km",
    "degrees": "{{value}}°",
    "meters": "{{value}} m"
  }
```

- [ ] **Step 2: Add qibla keys to en.json**

Modify `D:/adhan-time/locales/en.json`. Insert inside `screens` (after `settings`, before `placeholder`):

```json
    "qibla": {
      "tabLabel": "Qibla",
      "eyebrow": "qibla",
      "bearingLabel": "Bearing",
      "distanceLabel": "Distance",
      "statusLocation": "Location: ±{{meters}} m",
      "statusCompass": "Compass: ±{{degrees}}°",
      "statusCompassUnknown": "Compass: calibrating",
      "atKaaba": "You are at the Kaaba",
      "permissionTitle": "Location permission required",
      "permissionBody": "We need your location to show the direction of the Kaaba.",
      "openSettings": "Open settings",
      "locationServicesOff": "Location services are off. Please enable them in system settings.",
      "acquiringLocation": "Acquiring location",
      "sensorMissing": "This device has no compass sensor.",
      "headingFallbackNote": "Granting precise location may improve accuracy.",
      "calibrationTitle": "Compass calibration",
      "calibrationBody": "Wave the phone in a figure-8 motion.",
      "calibrationUnreliable": "Compass is unreliable — are there metal or electronic devices nearby?"
    },
```

Also replace the `units` block:

```json
  "units": {
    "hour_one": "{{count}} hour",
    "hour_other": "{{count}} hours",
    "minute_one": "{{count}} minute",
    "minute_other": "{{count}} minutes",
    "km": "{{value}} km",
    "degrees": "{{value}}°",
    "meters": "{{value}} m"
  }
```

- [ ] **Step 3: Type check (i18n type augmentation may surface mismatches)**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add locales/tr.json locales/en.json
git commit -m "feat(i18n): add qibla compass translation keys"
```

---

## Task 6: Implement useUserLocation hook

**Files:**
- Create: `D:/adhan-time/hooks/useUserLocation.ts`

- [ ] **Step 1: Create the hook**

```ts
// D:/adhan-time/hooks/useUserLocation.ts
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import { logger } from '@/utils/logger';

export type LocationStatus =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'servicesOff' }
  | { kind: 'acquiring' }
  | { kind: 'ready'; lat: number; lon: number; accuracyM: number }
  | { kind: 'error'; message: string };

type Options = {
  /** When false, the hook is paused (used to release sensors when the screen is unfocused). */
  enabled: boolean;
};

export function useUserLocation({ enabled }: Options): LocationStatus {
  const [status, setStatus] = useState<LocationStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      setStatus({ kind: 'requesting' });

      const services = await Location.hasServicesEnabledAsync();
      if (cancelled) return;
      if (!services) {
        setStatus({ kind: 'servicesOff' });
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== 'granted') {
        setStatus({ kind: 'denied' });
        return;
      }

      setStatus({ kind: 'acquiring' });

      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setStatus({
          kind: 'ready',
          lat: initial.coords.latitude,
          lon: initial.coords.longitude,
          accuracyM: initial.coords.accuracy ?? 0,
        });

        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 5000 },
          (pos) => {
            setStatus({
              kind: 'ready',
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracyM: pos.coords.accuracy ?? 0,
            });
          },
        );
      } catch (e) {
        logger.error('useUserLocation failed', { error: String(e) });
        if (!cancelled) setStatus({ kind: 'error', message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return status;
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint -- hooks/useUserLocation.ts
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add hooks/useUserLocation.ts
git commit -m "feat(qibla): add useUserLocation hook with permission and lifecycle handling"
```

---

## Task 7: Implement useDeviceHeading hook with low-pass filter and platform-normalized accuracy

**Files:**
- Create: `D:/adhan-time/hooks/useDeviceHeading.ts`

- [ ] **Step 1: Create the hook**

```ts
// D:/adhan-time/hooks/useDeviceHeading.ts
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { HEADING_ACCURACY, HEADING_EMA_ALPHA } from '@/constants/qibla';
import { logger } from '@/utils/logger';

export type HeadingQuality = 'high' | 'medium' | 'low' | 'unreliable' | 'unknown';

export type HeadingStatus =
  | { kind: 'idle' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      /** Smoothed heading in [0, 360) — degrees clockwise from geographic north. */
      heading: number;
      /** 'true' = geographic north, 'magnetic' = uncorrected (only when trueHeading unavailable). */
      source: 'true' | 'magnetic';
      /** Approximate accuracy in degrees (normalized across platforms). null if unknown. */
      accuracyDeg: number | null;
      quality: HeadingQuality;
    };

type Options = { enabled: boolean };

export function useDeviceHeading({ enabled }: Options): HeadingStatus {
  const [status, setStatus] = useState<HeadingStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setStatus({ kind: 'idle' });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let smoothed: number | null = null;

    void (async () => {
      try {
        subscription = await Location.watchHeadingAsync((reading) => {
          if (cancelled) return;

          const trueHeading = reading.trueHeading ?? -1;
          const magHeading = reading.magHeading ?? -1;
          const raw = trueHeading >= 0 ? trueHeading : magHeading;
          if (raw < 0) return;

          smoothed = applyEma(smoothed, raw, HEADING_EMA_ALPHA);
          const accuracyDeg = normalizeAccuracy(reading.accuracy);

          setStatus({
            kind: 'ready',
            heading: smoothed,
            source: trueHeading >= 0 ? 'true' : 'magnetic',
            accuracyDeg,
            quality: classifyQuality(accuracyDeg),
          });
        });
      } catch (e) {
        logger.error('useDeviceHeading failed', { error: String(e) });
        if (!cancelled) setStatus({ kind: 'error', message: String(e) });
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return status;
}

function applyEma(prev: number | null, raw: number, alpha: number): number {
  if (prev === null) return raw;
  // Handle the 0/360 wrap by smoothing along the shortest arc.
  let delta = raw - prev;
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  const next = prev + alpha * delta;
  return (next + 360) % 360;
}

function normalizeAccuracy(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (Platform.OS === 'ios') return value; // iOS reports degrees directly
  // Android: Location.Accuracy levels — empirical mapping to a degree-equivalent scale.
  // 3 (high) → 5°, 2 (medium) → 15°, 1 (low) → 30°, 0 (unreliable) → 50°, -1 → unknown.
  if (value < 0) return null;
  if (value >= 3) return 5;
  if (value >= 2) return 15;
  if (value >= 1) return 30;
  return 50;
}

function classifyQuality(accuracyDeg: number | null): HeadingQuality {
  if (accuracyDeg === null) return 'unknown';
  if (accuracyDeg <= HEADING_ACCURACY.goodMaxDeg) return 'high';
  if (accuracyDeg <= HEADING_ACCURACY.warnMaxDeg) return 'medium';
  if (accuracyDeg <= HEADING_ACCURACY.lowMaxDeg) return 'low';
  return 'unreliable';
}
```

- [ ] **Step 2: Type check**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Lint**

Run:
```bash
npm run lint -- hooks/useDeviceHeading.ts
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add hooks/useDeviceHeading.ts
git commit -m "feat(qibla): add useDeviceHeading hook with EMA smoothing and platform-normalized accuracy"
```

---

## Task 8: Implement CompassRose component

**Files:**
- Create: `D:/adhan-time/components/CompassRose.tsx`

- [ ] **Step 1: Create the component**

```tsx
// D:/adhan-time/components/CompassRose.tsx
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './Theme';

type Props = { size: number };

const CARDINALS = [
  { label: 'N', deg: 0, accent: true },
  { label: 'E', deg: 90, accent: false },
  { label: 'S', deg: 180, accent: false },
  { label: 'W', deg: 270, accent: false },
];

const TICK_COUNT = 36;

export function CompassRose({ size }: Props) {
  const radius = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}>
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const angle = (360 / TICK_COUNT) * i;
        const isMajor = i % 3 === 0;
        return (
          <View
            key={i}
            style={[
              styles.tick,
              isMajor ? styles.tickMajor : styles.tickMinor,
              {
                top: radius - (isMajor ? 14 : 8),
                left: radius - (isMajor ? 1 : 0.5),
                transform: [
                  { translateY: -radius + (isMajor ? 14 : 8) },
                  { rotate: `${angle}deg` },
                  { translateY: radius - (isMajor ? 14 : 8) },
                ],
              },
            ]}
          />
        );
      })}
      {CARDINALS.map(({ label, deg, accent }) => {
        const offset = radius - 24;
        const rad = (deg * Math.PI) / 180;
        const x = Math.sin(rad) * offset;
        const y = -Math.cos(rad) * offset;
        return (
          <Text
            key={label}
            style={[
              styles.cardinal,
              accent && styles.cardinalAccent,
              { left: radius + x - 10, top: radius + y - 12 },
            ]}
          >
            {label}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  tick: { position: 'absolute', backgroundColor: colors.borderSoft },
  tickMinor: { width: 1, height: 6, opacity: 0.6 },
  tickMajor: { width: 2, height: 12, backgroundColor: colors.border },
  cardinal: {
    position: 'absolute',
    width: 20,
    textAlign: 'center',
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    letterSpacing: 1.6,
    color: colors.textDim,
  },
  cardinalAccent: { color: colors.primary },
});
```

- [ ] **Step 2: Type check + lint**

Run:
```bash
npm run type-check && npm run lint -- components/CompassRose.tsx
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/CompassRose.tsx
git commit -m "feat(qibla): add CompassRose component with cardinal markers and ticks"
```

---

## Task 9: Implement QiblaCompass component (the rotating dial)

**Files:**
- Create: `D:/adhan-time/components/QiblaCompass.tsx`

- [ ] **Step 1: Create the component**

```tsx
// D:/adhan-time/components/QiblaCompass.tsx
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CompassRose } from './CompassRose';
import { colors, fonts, spacing } from './Theme';

type Props = {
  size: number;
  /** Smoothed device heading in degrees (0..360, clockwise from north). */
  deviceHeading: number;
  /** Bearing from user to Kaaba in degrees (0..360). */
  qiblaBearing: number;
  /** Whether the alignment indicator should glow (|delta| < 3°). */
  aligned: boolean;
  /** Whether the needle should render in the unreliable state (red, dim). */
  unreliable: boolean;
};

const NEEDLE_LENGTH_RATIO = 0.42;

export function QiblaCompass({ size, deviceHeading, qiblaBearing, aligned, unreliable }: Props) {
  const roseRotation = useSharedValue(0);
  const haloOpacity = useSharedValue(0);

  useEffect(() => {
    roseRotation.value = withTiming(-deviceHeading, { duration: 80 });
  }, [deviceHeading, roseRotation]);

  useEffect(() => {
    haloOpacity.value = withTiming(aligned ? 1 : 0, { duration: 250 });
  }, [aligned, haloOpacity]);

  const roseStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${roseRotation.value}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }));

  // The Kaaba marker rotates with the rose so it points to the qibla bearing in world space.
  // Its position relative to the rose center is fixed at (qiblaBearing) degrees from north.
  const radius = size / 2;
  const markerOffset = radius * NEEDLE_LENGTH_RATIO;
  const rad = (qiblaBearing * Math.PI) / 180;
  const markerX = Math.sin(rad) * markerOffset;
  const markerY = -Math.cos(rad) * markerOffset;

  const needleColor = unreliable ? colors.danger : colors.primary;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          { width: size + 24, height: size + 24, borderRadius: (size + 24) / 2 },
          haloStyle,
        ]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
        <CompassRose size={size} />
        <View
          style={[
            styles.kaabaMarker,
            {
              left: radius + markerX - 14,
              top: radius + markerY - 14,
              borderColor: needleColor,
              opacity: unreliable ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[styles.kaabaGlyph, { color: needleColor }]}>◆</Text>
        </View>
      </Animated.View>
      <View style={[styles.centerDot, { backgroundColor: needleColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', marginVertical: spacing.lg },
  halo: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    opacity: 0,
  },
  kaabaMarker: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  kaabaGlyph: {
    fontFamily: fonts.serif,
    fontSize: 16,
    lineHeight: 18,
  },
  centerDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
```

- [ ] **Step 2: Type check + lint**

Run:
```bash
npm run type-check && npm run lint -- components/QiblaCompass.tsx
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/QiblaCompass.tsx
git commit -m "feat(qibla): add QiblaCompass component with reanimated rotation and alignment halo"
```

---

## Task 10: Implement CalibrationBanner component

**Files:**
- Create: `D:/adhan-time/components/CalibrationBanner.tsx`

- [ ] **Step 1: Create the component**

```tsx
// D:/adhan-time/components/CalibrationBanner.tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, spacing } from './Theme';

type Props = {
  /** When true, renders the unreliable variant (stronger warning copy + danger color). */
  unreliable: boolean;
};

export function CalibrationBanner({ unreliable }: Props) {
  const { t } = useTranslation();
  const t01 = useSharedValue(0);

  useEffect(() => {
    t01.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t01]);

  const dotStyle = useAnimatedStyle(() => {
    const x = Math.sin(t01.value * Math.PI * 2) * 12;
    const y = Math.sin(t01.value * Math.PI * 4) * 6;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  const accent = unreliable ? colors.danger : colors.primary;
  const body = unreliable ? t('screens.qibla.calibrationUnreliable') : t('screens.qibla.calibrationBody');

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <View style={styles.iconBox}>
        <Animated.View style={[styles.dot, { backgroundColor: accent }, dotStyle]} />
      </View>
      <View style={styles.textBox}>
        <Text style={[styles.title, { color: accent }]}>
          {t('screens.qibla.calibrationTitle')}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  textBox: { flex: 1 },
  title: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  body: { fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 13, color: colors.textDim },
});
```

- [ ] **Step 2: Type check + lint**

Run:
```bash
npm run type-check && npm run lint -- components/CalibrationBanner.tsx
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/CalibrationBanner.tsx
git commit -m "feat(qibla): add CalibrationBanner component with figure-8 animation"
```

---

## Task 11: Implement qibla screen

**Files:**
- Create: `D:/adhan-time/app/(tabs)/qibla.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// D:/adhan-time/app/(tabs)/qibla.tsx
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalibrationBanner } from '@/components/CalibrationBanner';
import { HorizonRule } from '@/components/HorizonRule';
import { QiblaCompass } from '@/components/QiblaCompass';
import { colors, fonts, spacing } from '@/components/Theme';
import { AT_KAABA_RADIUS_KM } from '@/constants/qibla';
import { useDeviceHeading } from '@/hooks/useDeviceHeading';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useLocationStore } from '@/store/locationStore';
import { distanceToKaabaKm, qiblaBearing } from '@/utils/geo';

const COMPASS_SIZE = 280;
const ALIGNMENT_TOLERANCE_DEG = 3;

export default function QiblaScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const cityName = useLocationStore((s) => s.selected?.districtName ?? null);

  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  const location = useUserLocation({ enabled: active });
  const heading = useDeviceHeading({ enabled: active });

  const qibla = useMemo(() => {
    if (location.kind !== 'ready') return null;
    return {
      bearing: qiblaBearing(location.lat, location.lon),
      distanceKm: distanceToKaabaKm(location.lat, location.lon),
      accuracyM: location.accuracyM,
    };
  }, [location]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>· {t('screens.qibla.eyebrow')} ·</Text>
        {cityName && <Text style={styles.city}>{cityName}</Text>}
      </View>

      <Body
        location={location}
        heading={heading}
        qibla={qibla}
      />
    </View>
  );
}

type LocationStatus = ReturnType<typeof useUserLocation>;
type HeadingStatus = ReturnType<typeof useDeviceHeading>;
type QiblaData = { bearing: number; distanceKm: number; accuracyM: number } | null;

function Body({ location, heading, qibla }: { location: LocationStatus; heading: HeadingStatus; qibla: QiblaData }) {
  const { t } = useTranslation();

  if (location.kind === 'denied') return <PermissionCard />;
  if (location.kind === 'servicesOff') return <Centered text={t('screens.qibla.locationServicesOff')} />;
  if (location.kind === 'error') return <Centered text={t('errors.unknown')} />;
  if (location.kind !== 'ready' || !qibla) {
    return <Centered text={t('screens.qibla.acquiringLocation') + '…'} />;
  }
  if (heading.kind === 'error') return <Centered text={t('errors.unknown')} />;
  if (heading.kind === 'unsupported') return <Centered text={t('screens.qibla.sensorMissing')} />;
  if (heading.kind !== 'ready') {
    return <Centered text={t('screens.qibla.acquiringLocation') + '…'} />;
  }

  const atKaaba = qibla.distanceKm < AT_KAABA_RADIUS_KM;
  const delta = signedDelta(heading.heading, qibla.bearing);
  const aligned = !atKaaba && Math.abs(delta) < ALIGNMENT_TOLERANCE_DEG;
  const unreliable = heading.quality === 'unreliable';
  const showCalibration = heading.quality === 'medium' || heading.quality === 'low' || unreliable;

  return (
    <View style={styles.body}>
      {showCalibration && (
        <View style={styles.bannerWrap}>
          <CalibrationBanner unreliable={unreliable} />
        </View>
      )}

      <View style={styles.compassArea}>
        {atKaaba ? (
          <Text style={styles.atKaaba}>{t('screens.qibla.atKaaba')}</Text>
        ) : (
          <QiblaCompass
            size={COMPASS_SIZE}
            deviceHeading={heading.heading}
            qiblaBearing={qibla.bearing}
            aligned={aligned}
            unreliable={unreliable}
          />
        )}
      </View>

      {!atKaaba && (
        <View style={styles.readout}>
          <ReadoutItem
            label={t('screens.qibla.bearingLabel')}
            value={`${qibla.bearing.toFixed(1)}°`}
            unreliable={unreliable}
          />
          <View style={styles.readoutDivider} />
          <ReadoutItem
            label={t('screens.qibla.distanceLabel')}
            value={t('units.km', { value: formatKm(qibla.distanceKm) })}
            unreliable={unreliable}
          />
        </View>
      )}

      <HorizonRule variant="short" marginVertical={spacing.lg} />

      <View style={styles.statusFooter}>
        <Text style={styles.status}>
          {t('screens.qibla.statusLocation', { meters: Math.round(qibla.accuracyM) })}
        </Text>
        <Text style={styles.statusDot}>·</Text>
        <Text style={styles.status}>
          {heading.accuracyDeg === null
            ? t('screens.qibla.statusCompassUnknown')
            : t('screens.qibla.statusCompass', { degrees: Math.round(heading.accuracyDeg) })}
        </Text>
      </View>

      {heading.source === 'magnetic' && (
        <Text style={styles.fallbackNote}>{t('screens.qibla.headingFallbackNote')}</Text>
      )}
    </View>
  );
}

function ReadoutItem({ label, value, unreliable }: { label: string; value: string; unreliable: boolean }) {
  return (
    <View style={styles.readoutItem}>
      <Text style={styles.readoutLabel}>{label}</Text>
      <Text style={[styles.readoutValue, unreliable && styles.readoutValueDim]}>{value}</Text>
    </View>
  );
}

function PermissionCard() {
  const { t } = useTranslation();
  return (
    <View style={styles.center}>
      <Text style={styles.eyebrow}>· {t('screens.qibla.permissionTitle')} ·</Text>
      <Text style={styles.permissionBody}>{t('screens.qibla.permissionBody')}</Text>
      <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
        <Text style={styles.buttonText}>{t('screens.qibla.openSettings')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.centeredText}>{text}</Text>
    </View>
  );
}

function signedDelta(a: number, b: number): number {
  let d = ((a - b + 540) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

function formatKm(km: number): string {
  if (km >= 1000) return Math.round(km).toLocaleString();
  return km.toFixed(1);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { alignItems: 'center', paddingBottom: spacing.lg },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  city: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 28,
    color: colors.cream,
    marginTop: spacing.xs,
  },
  body: { flex: 1 },
  bannerWrap: { marginBottom: spacing.md },
  compassArea: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  atKaaba: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 32,
    color: colors.primary,
    textAlign: 'center',
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  readoutItem: { alignItems: 'center', minWidth: 110 },
  readoutDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  readoutLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: 4,
  },
  readoutValue: {
    fontFamily: fonts.serif,
    fontVariant: ['tabular-nums'],
    fontSize: 22,
    color: colors.cream,
    letterSpacing: 0.5,
  },
  readoutValueDim: { color: colors.textFaint },
  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  status: { fontFamily: fonts.sans, fontSize: 11, color: colors.textFaint, letterSpacing: 0.5 },
  statusDot: { color: colors.textFaint, marginHorizontal: spacing.sm },
  fallbackNote: {
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 12,
    color: colors.textFaint,
    marginTop: spacing.xs,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  centeredText: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.textDim, fontSize: 14 },
  permissionBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  buttonText: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.primary,
  },
});
```

- [ ] **Step 2: Type check + lint**

Run:
```bash
npm run type-check && npm run lint -- "app/(tabs)/qibla.tsx"
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/qibla.tsx"
git commit -m "feat(qibla): add qibla compass screen with permission and calibration states"
```

---

## Task 12: Wire qibla tab into tab layout

**Files:**
- Modify: `D:/adhan-time/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Insert the new tab between home and settings**

Modify `D:/adhan-time/app/(tabs)/_layout.tsx`. Replace the JSX inside `<Tabs ...>` (the three `Tabs.Screen` declarations) with:

```tsx
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: t('screens.home.today'),
          tabBarIcon: ({ color }) => <TabGlyph color={color}>·</TabGlyph>,
        }}
      />
      <Tabs.Screen
        name="qibla"
        options={{
          tabBarLabel: t('screens.qibla.tabLabel'),
          tabBarIcon: ({ color }) => <TabGlyph color={color}>◆</TabGlyph>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: t('screens.settings.title'),
          tabBarIcon: ({ color }) => <TabGlyph color={color}>·</TabGlyph>,
        }}
      />
```

- [ ] **Step 2: Type check + lint**

Run:
```bash
npm run type-check && npm run lint -- "app/(tabs)/_layout.tsx"
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "feat(qibla): wire qibla screen into tab navigation"
```

---

## Task 13: Run full quality gate

- [ ] **Step 1: Full lint**

Run:
```bash
npm run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Full type check**

Run:
```bash
npm run type-check
```

Expected: 0 errors.

- [ ] **Step 3: Run all tests**

Run:
```bash
npm run test
```

Expected: PASS — including all `utils/geo.test.ts` cases plus existing `utils/time.test.ts`.

- [ ] **Step 4: Expo doctor**

Run:
```bash
npx expo doctor
```

Expected: All checks pass.

- [ ] **Step 5: If any quality gate failed, fix and re-run before proceeding**

---

## Task 14: Manual device testing (mandatory before merging — see CLAUDE.md `09-testing.md`)

Sensor-driven UIs cannot be validated in simulator/emulator alone. The following **must** be performed on at least one physical iOS and one physical Android device. The implementing engineer ticks each box only after observing the behavior in person.

- [ ] **Step 1: Build dev client for iOS device**

Run:
```bash
eas build --profile development --platform ios
```

Install on a physical device.

- [ ] **Step 2: Build dev client for Android device**

Run:
```bash
eas build --profile development --platform android
```

Install on a physical device.

- [ ] **Step 3: Run the manual test checklist**

For each item, observe the actual behavior on the device and tick.

**Permission flow:**
- [ ] First open of Qibla tab → location permission prompt appears
- [ ] Deny → Permission card appears with `Open settings` link
- [ ] Tap `Open settings` → system Settings app opens
- [ ] Grant in Settings, return to app → compass renders

**Bearing accuracy (math):**
- [ ] At a known location in Istanbul, bearing reads 150°–155°
- [ ] Cross-check with a second qibla app or qiblafinder.com — within ±2°
- [ ] At a New York-area location (or VPN-aware test), bearing reads 56°–60°

**Heading source (sensor):**
- [ ] iOS: status footer shows compass accuracy in degrees
- [ ] Android: status footer shows compass accuracy in degrees (normalized from level)
- [ ] Phone rotates → compass rose counter-rotates so Kaaba marker stays toward Kaaba in world space
- [ ] Built-in iOS Compass app and our heading agree within 5° after calibration

**Calibration:**
- [ ] Holding phone next to a laptop / metal surface → calibration banner appears within ~3 seconds
- [ ] Wave figure-8 motion → accuracy improves, banner disappears
- [ ] Holding phone in a magnetically hostile spot → banner switches to `unreliable` variant, needle goes red

**Alignment:**
- [ ] Aim phone toward Kaaba bearing → halo glow activates, |delta| visibly < 3°

**Battery / lifecycle:**
- [ ] Switch to Home tab → returning to Qibla, watchers reattach (no stale frozen state)
- [ ] Background the app for 2 minutes, return → state recovers cleanly

**Edge cases:**
- [ ] Disable location services system-wide → screen shows "Location services off" message
- [ ] Re-enable → screen recovers without app restart
- [ ] Airplane mode → bearing still computes (last known GPS), compass still works

- [ ] **Step 4: Final commit only after all manual checks pass**

If any manual check fails, file the issue and fix before merging. Do not mark this task complete on partial passes.

```bash
git commit --allow-empty -m "test(qibla): manual device test checklist signed off"
```

---

## Acceptance Criteria (from spec §12)

- [ ] Computed qibla bearing within ±0.5° vs reference for 3 cities (covered by `utils/geo.test.ts`)
- [ ] Calibration banner appears when accuracy > 20° (covered by Task 14 manual checks)
- [ ] No literal user-facing strings in code (enforced by lint + reviewed during Task 13)
- [ ] No silent catch blocks (every error path produces user-visible state — Tasks 6, 7, 11)
- [ ] `tsc --noEmit` and `eslint` clean (Task 13)
- [ ] Unit tests for `utils/geo.ts` pass (Task 4)
- [ ] Manual checklist signed off on real iOS + real Android (Task 14)
