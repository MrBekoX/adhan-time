import { Platform, type TextStyle } from 'react-native';

export const colors = {
  bg: '#040806',
  bgGreenTop: '#0E2C1E',
  bgGreenMid: '#0A2117',
  bgInkBottom: '#03060A',
  bgSoft: '#0A1A12',
  card: '#0D2118',
  cardElevated: '#10271C',
  border: '#1A3625',
  borderSoft: '#13261A',
  text: '#F4ECDB',
  textDim: '#92A599',
  textFaint: '#5A6B61',
  primary: '#E8B86D',
  primaryDark: '#A47B36',
  primaryGlow: 'rgba(232,184,109,0.14)',
  primaryEdge: 'rgba(232,184,109,0.32)',
  emerald: '#1F5E3F',
  emeraldGlow: 'rgba(31,94,63,0.20)',
  ink: '#040806',
  cream: '#F4ECDB',
  danger: '#E07A6B',
  prayer: {
    imsak: '#5A7CA8',
    gunes: '#E8B86D',
    ogle: '#F0CC78',
    ikindi: '#C99367',
    aksam: '#9C6B7E',
    yatsi: '#3F5775',
  },
} as const;

export const radius = { sm: 4, md: 10, lg: 18, xl: 28, full: 999 } as const;
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 20, xl: 32, xxl: 48 } as const;

export const fonts = {
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  serifBold: Platform.select({ ios: 'Georgia-Bold', android: 'serif', default: 'serif' }) as string,
  sans: Platform.select({ ios: 'HelveticaNeue', android: 'sans-serif', default: 'System' }) as string,
  sansMedium: Platform.select({
    ios: 'HelveticaNeue-Medium',
    android: 'sans-serif-medium',
    default: 'System',
  }) as string,
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const type = {
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.textDim,
  } as TextStyle,
  display: {
    fontFamily: fonts.serif,
    fontSize: 92,
    letterSpacing: -2,
    color: colors.cream,
  } as TextStyle,
  headline: {
    fontFamily: fonts.serif,
    fontSize: 28,
    letterSpacing: -0.4,
    color: colors.cream,
  } as TextStyle,
  serifItalic: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    color: colors.cream,
  } as TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textDim,
  } as TextStyle,
  caption: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textFaint,
  } as TextStyle,
  numeric: {
    fontFamily: fonts.serif,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    color: colors.cream,
  } as TextStyle,
} as const;

export const PRAYER_GLYPHS: Record<string, string> = {
  imsak: 'I',
  gunes: 'II',
  ogle: 'III',
  ikindi: 'IV',
  aksam: 'V',
  yatsi: 'VI',
};
