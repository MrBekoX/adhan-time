import { Alert, I18nManager } from 'react-native';

import { i18n, isRtlLocale, type Locale } from '@/locales/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import { logger } from '@/utils/logger';

/**
 * Yeni locale'i uygular: store'a yazar, i18next'i günceller, gerekirse RTL düzenini değiştirir.
 *
 * @returns Çağıranın akışına devam edip etmemesi gerektiği. RTL değişimi gerekiyorsa
 *   uygulamanın yeniden başlatılması gerektiğinden `false` döner ve kullanıcıya uyarı gösterilir.
 */
export async function applyLocale(locale: Locale): Promise<boolean> {
  const current = useSettingsStore.getState().locale;
  if (current === locale) return true;

  const rtlChange = isRtlLocale(current) !== isRtlLocale(locale);

  useSettingsStore.getState().setLocale(locale);
  try {
    await i18n.changeLanguage(locale);
  } catch (e) {
    logger.warn('i18n changeLanguage failed', { error: String(e) });
  }

  if (!rtlChange) return true;

  // RTL ↔ LTR geçişi: I18nManager.forceRTL native düzeyde davranır,
  // gerçek etki yalnızca uygulama yeniden başlatıldıktan sonra görünür.
  try {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRtlLocale(locale));
  } catch (e) {
    logger.warn('I18nManager.forceRTL failed', { error: String(e) });
  }

  Alert.alert(
    i18n.t('screens.settings.language'),
    i18n.t('screens.settings.restartRequired'),
  );

  return false;
}
