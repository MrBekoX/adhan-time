# Qibla Compass — Design Spec

**Date:** 2026-05-03
**Status:** Approved (brainstorming complete)
**Owner:** Berkay Kaplan

---

## 1. Problem & Goal

Add a Qibla compass to adhan-time so users can find the direction of the Kaaba from their current location. The feature must be **religiously accurate** — wrong bearing misleads worshippers; this is treated as ibadet hakkı, not a UX bug.

**Note on API:** `CLAUDE.md` says ezanvakti API doesn't expose qibla; verified during brainstorming (no `/qibla`, no coordinates on districts). The compass is computed locally from device GPS + magnetometer; no API dependency.

## 2. Scope

In scope:
- New tab `(tabs)/qibla.tsx`
- GPS-based user location (no fallback to selected city)
- Heading via `expo-location.watchHeadingAsync` (trueHeading), magHeading fallback
- Great-circle initial bearing from user → Kaaba
- Distance to Kaaba (haversine, km)
- Calibration banner when heading accuracy is poor
- Permission flow + sensor-missing fallback

Out of scope:
- Selected-city fallback (user picked GPS-only, A in brainstorm)
- Background tracking / widgets
- AR overlay / camera view

## 3. User Flow

1. User taps **Qibla** tab
2. First time: app requests foreground location permission
   - Granted → continue
   - Denied → show "Konum izni gerekli" screen with `Linking.openSettings()` link
3. App acquires GPS fix (spinner: "Konum alınıyor…")
4. App starts heading subscription
5. Compass screen renders:
   - Compass rose (N/E/S/W rotates with phone)
   - Kaaba icon at the qibla bearing (stays toward Kaaba relative to ground)
   - Bearing readout (degrees) + distance readout (km)
   - Calibration banner if accuracy poor
6. On focus loss (`useFocusEffect`), watchers are stopped (battery)

## 4. Architecture

Follows `01-architecture.md` layer rules.

### New files

```
app/(tabs)/qibla.tsx                  ← screen (composition + hooks)
app/(tabs)/_layout.tsx                ← MODIFY: add 3rd tab
components/QiblaCompass.tsx           ← presentational (props only)
components/CompassRose.tsx            ← N/E/S/W rose visual
components/CalibrationBanner.tsx      ← accuracy warning + figure-8 hint
hooks/useDeviceHeading.ts             ← expo-location heading + low-pass filter
hooks/useUserLocation.ts              ← expo-location position
services/qiblaService.ts              ← OPTIONAL: only if orchestration emerges; may be omitted if hooks suffice
constants/qibla.ts                    ← KAABA coords + thresholds
utils/geo.ts                          ← bearing + haversine (pure)
utils/geo.test.ts                     ← test vectors
locales/tr.json, locales/en.json      ← MODIFY: add qibla.* keys
```

### Layer responsibilities

| File | Layer | Pure? |
|---|---|---|
| `utils/geo.ts` | utils | yes (no side effects, no imports of services) |
| `constants/qibla.ts` | constants | yes |
| `services/qiblaService.ts` | services | yes (no React; thin wrapper if any) |
| `hooks/useDeviceHeading.ts` | hooks | impure (subscribes to native) |
| `hooks/useUserLocation.ts` | hooks | impure |
| `components/*` | components | yes (presentational, props in / callbacks out) |
| `app/(tabs)/qibla.tsx` | app | composition only |

### Dependencies (new)

- `expo-location` — for `getCurrentPositionAsync`, `watchHeadingAsync`
- `expo-sensors` — only as last-resort fallback (not strictly required if we trust expo-location's heading API)

## 5. Math & Accuracy

### Kaaba coordinate (canonical)

```ts
// constants/qibla.ts
export const KAABA = {
  lat: 21.4225,   // 21°25′21″N
  lon: 39.8262,   // 39°49′34″E
} as const;
```

Source: Diyanet / IslamicFinder consensus value (Black Stone corner).

### Initial bearing (great-circle)

```ts
// utils/geo.ts
export function qiblaBearing(lat: number, lon: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δλ = toRad(KAABA.lon - lon);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360; // 0..360, clockwise from north
}

export function distanceToKaabaKm(lat: number, lon: number): number {
  const R = 6371; // km, mean Earth radius
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA.lat);
  const Δφ = toRad(KAABA.lat - lat);
  const Δλ = toRad(KAABA.lon - lon);
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Test vectors (`utils/geo.test.ts`, ±0.5° tolerance)

| City | lat, lon | Expected bearing |
|---|---|---|
| Istanbul | 41.0082, 28.9784 | ~152° |
| Mecca | 21.4225, 39.8262 | undefined (at Kaaba — return 0 or NaN, document) |
| New York | 40.7128, -74.0060 | ~58° |
| Jakarta | -6.2088, 106.8456 | ~295° |
| Sydney | -33.8688, 151.2093 | ~277° |
| London | 51.5074, -0.1278 | ~119° |

Edge cases tested:
- User at Kaaba (distance < 100m) → display "Kabedesin" instead of bearing
- Anti-meridian (lon ≈ ±180°) → bearing wraps correctly
- Polar (|lat| > 89°) → degenerate but should not crash

## 6. Heading Pipeline

```
expo-location.watchHeadingAsync (default 1 Hz)
  → returns { trueHeading, magHeading, accuracy }
  → prefer trueHeading when ≥ 0; else magHeading
  → low-pass filter: smoothed = α * raw + (1 - α) * smoothed,  α = 0.15
  → useDeviceHeading hook returns { heading, accuracy, source: 'true' | 'magnetic' }
  → screen passes (qiblaBearing - heading) as rotation to Kaaba icon
```

### Why trueHeading?

Magnetic declination varies 0–25°+ across the globe (e.g., Istanbul ~+6° E, NYC ~−13° W). Using magHeading without correction misleads the user. iOS gives `trueHeading` directly (when location services enabled); Android computes it from magHeading + GPS-derived declination. Both are exposed as `trueHeading` in `expo-location`.

### Accuracy thresholds

| Accuracy (°) | Behavior |
|---|---|
| ≤ 20 | Normal — gold needle, no banner |
| 20 – 35 | Calibration banner visible, needle still gold but slightly muted |
| > 35 | Red needle, "Pusula güvenilir değil" overlay, distance/degrees go gray |

`trueHeading === -1` (iOS, location services off) → fall back to magHeading + footer note: "Hassas konum izni verirseniz daha doğru gösterilebilir".

### Filter rationale

α = 0.15 EMA keeps motion smooth without lying about precision. Higher α = jittery; lower α = laggy. Tune on real device. Accuracy field itself is **not** filtered — we want degradation to surface immediately.

## 7. UI / UX

Tab bar: **Home · Qibla · Settings**

Qibla screen layout (top → bottom):

1. **Header** — `· QIBLA ·` eyebrow (small caps tracked) + district name in cream serif italic (matches `home.tsx`)
2. **Calibration banner** (sticky when needed) — animated figure-8 icon, accuracy badge, copy: "Telefonu havada 8 hareketi çiz"
3. **Compass dial** (centered, ~75% of viewport width)
   - Outer ring: cream stroke, tick marks at 30° intervals
   - N/E/S/W letters rotate with phone (counter-rotation of needle)
   - Kaaba silhouette icon positioned at qibla bearing (stays anchored to ground)
   - Gold pulse halo when |currentBearing − qiblaBearing| < 3° + optional haptic (`Haptics.notificationAsync(Success)` once per alignment)
4. **Readout row** — `Bearing: 152.4°  ·  Distance: 4,832 km` (sans medium, dim color)
5. **Status footer** — `Konum: ±15 m · Pusula: ±8°` in `textFaint`

Visual style: matches `home.tsx` palette (cream/gold/serif italic, monochrome with single gold accent). No emoji, minimal iconography.

### Permission denied state

Centered card:
- Eyebrow: `· KONUM IZNI GEREKLI ·`
- Body: `Kıble yönünü göstermek için cihazın konumuna ihtiyacımız var.`
- Button: `Ayarları aç` → `Linking.openSettings()`

### Sensor-missing state (rare)

- Card showing only bearing + distance (still useful as a number)
- Note: `Bu cihazda pusula sensörü bulunmuyor.`

## 8. State & Lifecycle

- No persistence required (all state derived from sensors)
- `useFocusEffect` (expo-router) starts/stops both `useUserLocation` and `useDeviceHeading` watchers
- No store — local component state; reduces battery and avoids global heading subscription

## 9. Error Handling

| Condition | Handling |
|---|---|
| Location permission denied | Permission card |
| Location services off (system) | "Konum servisleri kapalı" + settings link |
| GPS fix timeout (>15s) | Spinner with retry button after 15s |
| Magnetometer unavailable | Sensor-missing card |
| `trueHeading === -1` | Fallback to magHeading + footer note |
| Heading subscription error | Catch, log via `utils/logger`, show retry |
| User stands at Kaaba (<100m) | Show `screens.qibla.atKaaba` message, suppress bearing |

No silent catch blocks — every failure path produces user-visible state per `02-code-style.md`.

## 10. i18n

New keys (added to both `tr.json` and `en.json`):

```
screens.qibla.title
screens.qibla.eyebrow
screens.qibla.bearingLabel
screens.qibla.distanceLabel
screens.qibla.statusLocation
screens.qibla.statusCompass
screens.qibla.atKaaba
screens.qibla.permissionTitle
screens.qibla.permissionBody
screens.qibla.openSettings
screens.qibla.locationServicesOff
screens.qibla.acquiringLocation
screens.qibla.sensorMissing
screens.qibla.calibration.title
screens.qibla.calibration.body
screens.qibla.calibration.unreliable
screens.qibla.headingFallbackNote
units.km
units.degrees
units.meters
```

Per `07-i18n.md`: zero literal strings in code.

## 11. Testing

### Unit (jest, mandatory)

- `utils/geo.test.ts` — 6 city bearings ±0.5°, distance sanity (Istanbul→Kaaba ≈ 2,470 km), edge cases (Kaaba itself, anti-meridian, near-poles)
- `services/qiblaService.test.ts` — if any orchestration logic exists

### Manual device testing (mandatory before merge)

- [ ] iOS physical device — trueHeading non-negative, our heading readout matches the built-in Compass app within 5° after calibration (sensor-level check, separate from qibla math)
- [ ] Android physical device — trueHeading present, declination applied
- [ ] Rotate phone → needle counter-rotates (target stays toward Kaaba)
- [ ] Istanbul: bearing 150°–155°
- [ ] Cross-check with Google Maps "directions to Kaaba" bearing
- [ ] Figure-8 calibration → accuracy improves visibly
- [ ] Near metal/laptop → accuracy degrades, banner appears
- [ ] Foreground/background switch → no battery drain (watchers stopped)
- [ ] Permission denied → permission card shown
- [ ] Location services off → correct error state
- [ ] Cross-device timezone scenario (per `08-timezone-handling.md`) — qibla independent of tz, sanity check

## 12. Acceptance Criteria

- [ ] Computed qibla bearing matches a known reference (e.g. qiblafinder.com / Google Earth manual measurement) within ±0.5° for 3 test cities (Istanbul, NYC, Sydney) — this validates the math, independent of sensor noise
- [ ] Calibration banner appears when accuracy > 20°
- [ ] No literal strings in code (i18n complete)
- [ ] No silent catch blocks
- [ ] `tsc --noEmit` and `eslint` clean
- [ ] Unit tests for `utils/geo.ts` pass
- [ ] Manual checklist (section 11) signed off on real iOS + real Android

## 13. Open Questions / Future Work

- Magnetic declination model fallback (e.g., WMM 2025) if future Android versions return inaccurate trueHeading — for now we trust the OS
- Visual polish: explore custom SVG compass rose vs Reanimated views
- Haptic on alignment — opt-in in settings (deferred)
- Selected-city fallback when GPS denied (deferred per user choice A)
- Widget / lock-screen complication (out of scope)

---

## References

- `CLAUDE.md` — project map
- `.claude/rules/01-architecture.md` — layer rules
- `.claude/rules/02-code-style.md` — TS / no `any`, no silent catch
- `.claude/rules/07-i18n.md` — i18n keys
- `.claude/rules/09-testing.md` — manual device test discipline
- `expo-location` heading docs: `https://docs.expo.dev/versions/latest/sdk/location/#locationheadingobject`
