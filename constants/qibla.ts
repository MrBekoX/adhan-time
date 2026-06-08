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
 * Magnetometer interference detection (rules/11). The fused rotation-vector's reported `accuracy`
 * stays "high" even under strong magnetic interference — measured ON-DEVICE: a desk read |B| = 190 µT
 * with accuracy = 3 while the true geomagnetic field in Turkey is ~47 µT, and the heading was garbage
 * (it swung ~176° from a 1–2 cm slide). So accuracy ALONE cannot detect a magnet/metal corrupting the
 * heading. We additionally compare the measured field magnitude |B| (µT) to the EXPECTED geomagnetic
 * intensity (NOAA WMM via `geomagnetism`, `point.f`) for the user's location: a deviation beyond
 * `FIELD_TOLERANCE_UT` ⇒ interference ⇒ heading unreliable (freeze the rose + "move away from metal").
 * The expected-field path is region-aware (Earth's field is ~22 µT at the magnetic equator to ~67 µT
 * near the poles); the absolute bounds are the fallback when no location/model is available.
 */
export const FIELD_TOLERANCE_UT = 20;
/** Absolute sanity bounds (µT) used only when the expected geomagnetic intensity is unavailable. */
export const FIELD_MIN_UT = 18;
export const FIELD_MAX_UT = 75;
/**
 * Time hysteresis: once interference is detected, hold the "unreliable" state for at least this long
 * after the LAST detection. Moving the phone through a magnetic gradient makes |B| swing across the
 * threshold, which without this flickered the banner on/off ("uyarı gidiyor … tekrar geliyor"). Holding
 * the warning until the field has stayed clean for HOLD_MS gives one stable warning instead of a strobe.
 */
export const INTERFERENCE_HOLD_MS = 1500;

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
// Raised 120 → 250 (heading-feed regularisation, 2026-06-08). On-device QHDBG capture proved the
// emitted heading is CLEAN (steady at rest, smooth ~0.25°/sample in slow rotation), so the felt "ağır
// adım atar gibi" stepping is NOT in the data — it is the UI-thread rose follow being fed irregularly
// because React re-renders the whole qibla Body on each heading publish, hogging the JS thread that
// also delivers the native sample + writes headingShared. The rose rides headingShared on the UI thread
// independently, so the text/alignment readout can publish far less often. During the slow fine-
// alignment turns where stepping is felt, the per-sample move stays under the 8° bypass, so this
// interval governs: 4Hz instead of 8Hz halves the re-render contention and steadies the feed.
export const HEADING_PUBLISH_MIN_INTERVAL_MS = 250;

/**
 * A heading change at or above this size bypasses the cadence gate so a fast turn still
 * updates the on-screen "turn X°" guidance promptly. Raised from 2° because the rose no
 * longer depends on React — only the text does, which tolerates coarser steps.
 */
export const HEADING_PUBLISH_MIN_DELTA_DEG = 8;

/**
 * Minimum heading change (vs the LAST PUBLISHED value) required to publish into React
 * state at all. Below this, the smoothed heading is just stationary sensor/EMA noise, so
 * re-rendering the whole qibla screen — even once the interval below elapses — is wasted
 * work that produces an identical readout.
 *
 * Measured on a Galaxy A30s: the old unconditional interval publish re-rendered the screen
 * ~8x/s while the phone sat still, churning ~11MB every ~25s (constant background GC, 59%
 * janky frames). Gating on real movement removes that idle churn yet stays responsive —
 * because lastPublished is NOT advanced when we skip, successive sub-threshold steps
 * accumulate, so slow real rotation still crosses the gate and publishes.
 *
 * Lowered 0.5° → 0.25° (slow-rotation freeze fix): the "turn X°" instruction/halo must track
 * a slow fine-alignment turn instead of freezing for ~1s. Idle EMA jitter (~0.03°/sample) is
 * still far below 0.25°, so stationary whole-screen re-renders remain suppressed. The rose
 * itself no longer depends on this gate at all — it follows the shared value per-frame
 * (see ROSE_FOLLOW_LAMBDA / roseFollowStep).
 */
export const HEADING_PUBLISH_MIN_IDLE_DELTA_DEG = 0.25;

/**
 * Idle-noise floor (degrees) for the UI-thread animation source. The hook writes a new sample
 * into `headingShared` only when the smoothed heading moves at least this much, so a perfectly
 * still phone's sub-noise jitter does not nudge the rose target (the frame-follow then has
 * nothing to chase and idles — no perpetual redraw).
 *
 * Lowered 0.4° → 0.05° (slow-rotation freeze fix): at 0.4° this deadband was a SECOND angular
 * staircase (on top of the native gate) that quantized a slow fine-alignment turn into a write
 * only every ~3 samples → the rose froze ~1s then jumped. At 0.05° it is effectively off for
 * any real motion (even ~0.3°/s reaches the shared value every sample) while still rejecting
 * the fused sensor's idle jitter (~0.03°/sample stays below it). Display smoothness no longer
 * comes from gating the feed — it comes from the per-frame `roseFollowStep` glide. Far inside
 * the 5° qibla tolerance, so it never affects accuracy.
 */
export const HEADING_SHARED_DEADBAND_DEG = 0.05;

/**
 * One Euro filter params for the native heading smoother (Android `CompassHeadingModule`),
 * pushed via `CompassHeading.setTuning`. JS-settable so tuning ships via OTA without a rebuild
 * (spec §3). Starting values; tuned on A30/Xiaomi via the CompassHDBG logcat (spec §9).
 *   minCutoff (Hz): cutoff at rest — lower = smoother/more lag when still.
 *   beta:           speed coefficient — higher = less lag during fast motion.
 *   dCutoff (Hz):   derivative low-pass cutoff (standard 1.0).
 */
// Device-verified originals (1.0/0.02). A 0.3/0.07 "kill the at-rest jitter" retune was tried and
// REVERTED: an on-device QHDBG capture proved the emitted heading is already CLEAN at rest (0.43°
// range over 13s, 0% reversals) and smooth in slow rotation — there is NO sensor/One-Euro jitter to
// chase. The "titriyor" the user sees only when HOLDING the phone is real HAND TREMOR shown faithfully
// (a separate, still-open item for a low-motion suppressor); the felt STEPPING was the display motion
// curve, fixed in ROSE_FOLLOW_LAMBDA below — not here. So these stay at the verified originals.
export const ONE_EURO_MIN_CUTOFF = 1.0;
export const ONE_EURO_BETA = 0.02;
export const ONE_EURO_DCUTOFF = 1.0;

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

/**
 * Compass-rose UI-thread follow (replaces the per-sample `withSpring` retarget).
 *
 * Each vsync the displayed angle eases a fraction toward the accumulated target via
 * `roseFollowStep` (an exponential/critically-damped follow). This decouples display
 * smoothness from sensor-sample cadence: the rose advances EVERY frame, so a sparse feed
 * (slow rotation) becomes a graceful glide instead of the old freeze-then-jump. Because the
 * step has no momentum term it can NEVER overshoot, structurally killing the A2 coast
 * regression; and because exponential decay is multiplicative it is exactly frame-rate
 * independent (identical feel on 60/90/120 Hz panels — required for a device-agnostic store
 * release). Spec: docs/superpowers/specs/2026-06-05-qibla-slow-rotation-freeze-fix-design.md §7.4.
 */
// Rate constant (1/s): τ = 1/λ; roseRotation += (target−roseRotation)·(1−e^(−λ·dt)) per vsync.
// LOWERED 45 → 8 (τ 22ms → 125ms) for SMOOTH, HEAVY DAMPING — the on-device fix for the felt
// "adımlama / ani hızlanma / duvara çarpma" (2026-06-08). DECISIVE evidence it is the MOTION CURVE and
// NOT render: on the same A30 the market compass the user finds smoother (co.esoft.qiblacompass) janks
// 64% (gfxinfo) vs our 28.6% — it drops 2× MORE frames yet FEELS smoother, so felt smoothness is not
// frame-drops. A high λ (45) is snappy: after each emit gap the follow whips ~half the arc in one frame
// then decelerates into the target (the "sudden-accel → wall"); on the A30's dropped frames a fast
// sweep's big per-frame steps read as "stepping". A low λ glides slowly and uniformly (laggy but
// fluid), like the competitor's damping. Tuned ON-DEVICE with the user: λ=12 fixed slow rotation but
// fast hand-sweeps still stepped; λ=8 smooths those too (the follow eases gently through a transient
// sweep, catching up after) while slow stays smooth (lag Δ<0.3°). Religious accuracy unaffected — this
// only delays the DISPLAY ~0.1–0.2s; the heading value the alignment math uses is unchanged. OTA-
// tunable; tune by feel. Lower = smoother/laggier (try 6 if a sweep still steps; 12 if slow feels laggy).
export const ROSE_FOLLOW_LAMBDA = 8;
// Clamp the per-frame dt so a background/foreground gap (one huge frame) can't snap the rose.
export const ROSE_FOLLOW_MAX_DT_SEC = 0.05;
// Convergence band (degrees): within this the follow snaps and stops writing (no idle redraw).
export const ROSE_FOLLOW_EPSILON = 0.05;
/**
 * Snap window (ms) after the compass (re)appears. During it the follow converges INSTANTLY to
 * the target instead of easing, so two one-time discontinuities land without a visible sweep:
 * the magnetic→true (WMM declination) correction at GPS lock, and — because every tab blur
 * unmounts QiblaCompass — any rotation that happened while the tab was away. Real motion is
 * smooth-followed only after this window. Kept short so it never masks genuine ongoing motion.
 */
export const ROSE_APPEAR_SNAP_MS = 200;
