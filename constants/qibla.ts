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
