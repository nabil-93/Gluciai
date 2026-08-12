import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

import { directionRestartRequired, isRTL } from './direction';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import de from './locales/de.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'ar', label: 'العربية', flag: '🇲🇦' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const STORAGE_KEY = 'glucoai.language';

/** Re-exported from the pure leaf so the 20+ existing `import { isRTL } from
 *  '@/i18n'` call sites are untouched. */
export { isRTL } from './direction';

/**
 * Apply layout direction.
 *
 * On web the flip is live. On native `forceRTL` only takes effect at the next
 * launch, so this REPORTS whether a restart is now owed instead of leaving the
 * patient with Arabic text in a left-to-right layout and no explanation. See
 * ./direction.ts for why that is the fix and why it is not an OTA reload.
 *
 * @returns `restartRequired` — true only when the direction actually changed on
 *          a native platform.
 */
export function applyDirection(lang: string): { restartRequired: boolean } {
  const rtl = isRTL(lang);
  const isWeb = Platform.OS === 'web';

  if (isWeb && typeof document !== 'undefined') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    return { restartRequired: false };
  }

  // Read the CURRENT direction before asking for the new one — afterwards
  // `I18nManager.isRTL` still reports the running context's direction, but
  // reading first keeps the comparison obvious.
  const restartRequired = directionRestartRequired(I18nManager.isRTL, lang, isWeb);
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return { restartRequired };
}

/**
 * Switch the app language.
 *
 * @returns `restartRequired` — the caller must tell the patient. Both call
 *          sites (profile-edit, welcome) do; a new one must too, or Arabic
 *          silently renders left-to-right again.
 */
export async function setAppLanguage(
  lang: LanguageCode
): Promise<{ restartRequired: boolean }> {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  return applyDirection(lang);
}

export async function getStoredLanguage(): Promise<LanguageCode | null> {
  const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as LanguageCode | null;
  return stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored) ? stored : null;
}

/** Device locales we auto-adopt on first launch: the app starts in the
 *  phone's language whenever we support it (ar/fr/de/en). Anything else
 *  (Spanish, Italian…) falls back to French — the app is Moroccan-first —
 *  and stays changeable from the welcome screen's language selector. */
const AUTO_DETECT_LANGUAGES: LanguageCode[] = ['ar', 'fr', 'de', 'en'];

export async function initI18n() {
  const stored = await getStoredLanguage();
  const device = Localization.getLocales()[0]?.languageCode ?? 'fr';
  const fallback: LanguageCode = AUTO_DETECT_LANGUAGES.includes(
    device as LanguageCode
  )
    ? (device as LanguageCode)
    : 'fr';
  const lng = stored ?? fallback;

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
      de: { translation: de },
    },
    lng,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });
  applyDirection(lng);
  return { language: lng, hasStoredLanguage: stored !== null };
}

export default i18n;
