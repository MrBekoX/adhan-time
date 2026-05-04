import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandRow } from '@/components/BrandRow';
import { CalibrationBanner } from '@/components/CalibrationBanner';
import { GradientCanvas } from '@/components/GradientCanvas';
import { HorizonRule } from '@/components/HorizonRule';
import { QiblaCompass } from '@/components/QiblaCompass';
import { colors, fonts, spacing } from '@/components/Theme';
import { ALIGN_ENTER_DEG, ALIGN_EXIT_DEG, AT_KAABA_RADIUS_KM } from '@/constants/qibla';
import { useDeviceHeading } from '@/hooks/useDeviceHeading';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useLocationStore } from '@/store/locationStore';
import { distanceToKaabaKm, qiblaBearing } from '@/utils/geo';
import { isUnreliable, signedDelta } from '@/utils/heading';
import { lowercaseInLocale } from '@/utils/textCase';

const COMPASS_SIZE = 260;

export default function QiblaScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const cityName = useLocationStore((s) => s.selected?.districtName ?? null);
  const countryName = useLocationStore((s) => s.selected?.countryName ?? null);

  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );

  const location = useUserLocation({ enabled: active });
  // Heading sensor needs location permission (Android computes trueHeading from
  // GPS-derived declination). Wait until location is ready before subscribing.
  // We also pass coordinates through so that on Android paths returning only
  // magnetic heading we can apply WMM declination compensation (SPEC-K2).
  const heading = useDeviceHeading({
    enabled: active && location.kind === 'ready',
    location: location.kind === 'ready' ? { lat: location.lat, lon: location.lon } : null,
  });

  const qibla = useMemo(() => {
    if (location.kind !== 'ready') return null;
    return {
      bearing: qiblaBearing(location.lat, location.lon),
      distanceKm: distanceToKaabaKm(location.lat, location.lon),
      accuracyM: location.accuracyM,
    };
  }, [location]);

  return (
    <View style={styles.root}>
      <GradientCanvas />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <BrandRow />

        <View style={styles.pageHead}>
          <View style={styles.cityRule} />
          <Text style={styles.eyebrow}>{t('screens.qibla.eyebrow')}</Text>
          {cityName ? (
            <>
              <Text style={styles.cityName}>{cityName}</Text>
              {countryName && (
                <Text style={styles.cityCountry}>
                  {lowercaseInLocale(countryName, i18n.language)}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.cityName}>—</Text>
          )}
        </View>

        <HorizonRule variant="gold" marginVertical={spacing.lg} />

        <Body location={location} heading={heading} qibla={qibla} />
      </ScrollView>
    </View>
  );
}

type LocationStatus = ReturnType<typeof useUserLocation>;
type HeadingStatus = ReturnType<typeof useDeviceHeading>;
type QiblaData = { bearing: number; distanceKm: number; accuracyM: number } | null;

function Body({ location, heading, qibla }: { location: LocationStatus; heading: HeadingStatus; qibla: QiblaData }) {
  const { t } = useTranslation();

  // Hooks must run unconditionally — compute defensively so the alignment state machine
  // sees stable input even before location/heading are ready.
  const ready = location.kind === 'ready' && heading.kind === 'ready' && qibla !== null;
  const delta =
    ready && heading.kind === 'ready' && qibla
      ? signedDelta(heading.heading, qibla.bearing)
      : 0;
  const atKaaba = qibla ? qibla.distanceKm < AT_KAABA_RADIUS_KM : false;
  // SPEC-K3 + K3c: 'unknown' is unreliable too — a calibrating compass must never
  // emit a positive alignment signal. Suppress alignment math itself so the band
  // never latches.
  // SPEC-K2: when WMM declination compensation could not be applied and we are on
  // raw magnetic heading, treat the reading as unreliable too — the deviation can
  // be 5–25° depending on region.
  const unreliable =
    heading.kind === 'ready' && (isUnreliable(heading.quality) || heading.source === 'magnetic');
  const aligned = useAlignment(delta, atKaaba || !ready || unreliable);
  useAlignmentHaptic(aligned, unreliable || atKaaba || !ready);

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

  const showCalibration =
    heading.quality === 'medium' || heading.quality === 'low' || unreliable;

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
        <Instruction delta={delta} aligned={aligned} unreliable={unreliable} />
      )}

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

function Instruction({
  delta,
  aligned,
  unreliable,
}: {
  delta: number;
  aligned: boolean;
  unreliable: boolean;
}) {
  const { t } = useTranslation();
  const absDeg = Math.max(1, Math.round(Math.abs(delta)));

  let text: string;
  let toneStyle: TextStyle = styles.instructionDirective;

  if (unreliable) {
    text = t('screens.qibla.instructionUnreliable');
    toneStyle = styles.instructionUnreliable;
  } else if (aligned) {
    text = t('screens.qibla.instructionAligned');
    toneStyle = styles.instructionAligned;
  } else if (delta > 0) {
    text = t('screens.qibla.instructionTurnLeft', { degrees: absDeg });
  } else {
    text = t('screens.qibla.instructionTurnRight', { degrees: absDeg });
  }

  return (
    <View style={styles.instructionWrap}>
      <Text style={[styles.instruction, toneStyle]}>{text}</Text>
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
      <Text style={styles.eyebrowSm}>· {t('screens.qibla.permissionTitle')} ·</Text>
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

/**
 * Fires a single success-haptic when the user enters the qibla alignment band.
 *
 * Suppressed when the heading is unreliable or we're at the Kaaba — in those cases the
 * `aligned` flag isn't a meaningful "you're facing qibla" signal.
 */
function useAlignmentHaptic(aligned: boolean, suppress: boolean): void {
  const wasAligned = useRef(false);
  useEffect(() => {
    if (suppress) {
      wasAligned.current = false;
      return;
    }
    if (aligned && !wasAligned.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    wasAligned.current = aligned;
  }, [aligned, suppress]);
}

/**
 * Hysteresis around the alignment indicator.
 *
 * A single threshold (e.g. 3°) flickers because compass noise (±3°) and EMA jitter cross
 * the boundary continuously. We enter "aligned" when |delta| < ALIGN_ENTER_DEG and only
 * leave when it exceeds ALIGN_EXIT_DEG, giving a stable band where the user gets steady
 * positive feedback while their hand inevitably drifts.
 */
function useAlignment(delta: number, atKaaba: boolean): boolean {
  const [aligned, setAligned] = useState(false);
  useEffect(() => {
    if (atKaaba) {
      if (aligned) setAligned(false);
      return;
    }
    const abs = Math.abs(delta);
    if (aligned && abs > ALIGN_EXIT_DEG) setAligned(false);
    else if (!aligned && abs < ALIGN_ENTER_DEG) setAligned(true);
  }, [delta, atKaaba, aligned]);
  return aligned;
}

function formatKm(km: number): string {
  if (km >= 1000) return Math.round(km).toLocaleString();
  return km.toFixed(1);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollView: { flex: 1, backgroundColor: 'transparent' },
  scroll: { paddingHorizontal: spacing.lg },

  pageHead: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cityRule: {
    width: 28,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.primary,
    opacity: 0.7,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginBottom: spacing.xs,
  },
  cityName: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 38,
    color: colors.cream,
    letterSpacing: -0.6,
    lineHeight: 42,
  },
  cityCountry: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.textDim,
    marginTop: 4,
    letterSpacing: 0.6,
  },

  body: { paddingTop: spacing.sm },
  bannerWrap: { marginBottom: spacing.md },
  compassArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  instructionWrap: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  instruction: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 22,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  instructionDirective: { color: colors.cream },
  instructionAligned: { color: colors.primary },
  instructionUnreliable: { color: colors.danger },
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
    color: colors.danger,
    marginTop: spacing.xs,
  },

  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  centeredText: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.textDim, fontSize: 14 },
  eyebrowSm: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
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
