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
