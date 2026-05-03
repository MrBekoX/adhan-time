import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import ar from './ar.json';
import en from './en.json';
import tr from './tr.json';
import zh from './zh.json';

export const SUPPORTED_LOCALES = ['tr', 'en', 'ar', 'zh'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

export function isRtlLocale(locale: string): boolean {
  return RTL_LOCALES.has(locale as Locale);
}

function detectInitialLocale(): Locale {
  const code = Localization.getLocales()[0]?.languageCode ?? 'tr';
  if ((SUPPORTED_LOCALES as readonly string[]).includes(code)) return code as Locale;
  return 'en';
}

const initial = detectInitialLocale();

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
    ar: { translation: ar },
    zh: { translation: zh },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  // Hermes runtime'da Intl.PluralRules her zaman tam değil; v3 formatına geri düş.
  compatibilityJSON: 'v3',
});

// İlk açılışta cihaz dili Arapça ise RTL'i layout seviyesinde ayarla.
// Persistlenen kullanıcı tercihi i18n init'ten sonra app/_layout.tsx içinde
// tekrar uygulanır; orada gerekirse uygulama yeniden yüklenir.
if (isRtlLocale(initial) !== I18nManager.isRTL) {
  try {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRtlLocale(initial));
  } catch {
    // I18nManager bazı test/headless ortamlarda native modülsüz çalışabilir.
  }
}

export { i18n };
