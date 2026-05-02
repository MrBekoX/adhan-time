import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import tr from './tr.json';

const deviceLang = Localization.getLocales()[0]?.languageCode ?? 'tr';
const initial = deviceLang === 'tr' ? 'tr' : 'en';

void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  // Hermes runtime'da Intl.PluralRules her zaman tam değil; v3 formatına geri düş.
  compatibilityJSON: 'v3',
});

export { i18n };
