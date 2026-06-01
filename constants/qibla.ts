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

/**
 * Low-pass filter coefficient for heading smoothing. Higher = more responsive, lower = smoother.
 * Tuned empirically:
 *   0.15 was too laggy — user rotated phone to qibla, smoothed value lagged ~3 s and the
 *   alignment indicator flickered while catching up. 0.30 converges within ~1 s and still
 *   damps single-sample sensor noise enough that the needle is visually stable.
 */
export const HEADING_EMA_ALPHA = 0.3;

/**
 * Cadence for publishing the smoothed heading into REACT STATE. The compass rose now
 * animates on the UI thread from a shared value (useDeviceHeading `headingShared` →
 * QiblaCompass), so React state only drives the textual/alignment UI (instruction, banner,
 * accuracy, alignment haptic) — none of which need 30Hz.
 *
 * Republishing every 33ms kept the JS thread busy enough to push EVERY frame just over the
 * 16.7ms budget — measured ~52% janky frames, 50th percentile 17ms on a Galaxy A30s even
 * while stationary (the 50Hz sensor + EMA jitter tripped the interval gate continuously),
 * which the user felt as micro-stutter. ~120ms (≈8Hz) frees the JS thread to deliver the
 * sensor stream (and the shared-value writes that drive the rose) regularly. Quality/source
 * changes still publish immediately (the `metadataChanged` bypass in the hook), so the
 * unreliable banner never lags.
 */
export const HEADING_PUBLISH_MIN_INTERVAL_MS = 120;

/**
 * A heading change at or above this size bypasses the cadence gate so a fast turn still
 * updates the on-screen "turn X°" guidance promptly. Raised from 2° because the rose no
 * longer depends on React — only the text does, which tolerates coarser steps.
 */
export const HEADING_PUBLISH_MIN_DELTA_DEG = 8;

/**
 * Alignment thresholds (degrees) for "facing qibla" with hysteresis.
 *
 * Without hysteresis at a single 3° threshold the indicator flickered on/off when |delta|
 * fluctuated around the boundary (sensor noise is ±3° in best case). The hysteresis band
 * (5° to enter, 8° to exit) gives a stable "near-aligned" zone.
 *
 * Religiously, facing the general direction of the Kaaba (cihet) is sufficient when far
 * from Mecca, so a 5° tolerance is well within the acceptable cone of qibla.
 */
export const ALIGN_ENTER_DEG = 5;
export const ALIGN_EXIT_DEG = 8;
