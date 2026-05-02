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
