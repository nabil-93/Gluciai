import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

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

export function isRTL(lang: string) {
  return lang === 'ar';
}

/** Apply layout direction. On web we can flip live; native needs a reload to fully apply. */
export function applyDirection(lang: string) {
  const rtl = isRTL(lang);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  } else {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export async function setAppLanguage(lang: LanguageCode) {
  await AsyncStorage.setItem(STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
  applyDirection(lang);
}

export async function getStoredLanguage(): Promise<LanguageCode | null> {
  const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as LanguageCode | null;
  return stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored) ? stored : null;
}

/** Device locales we auto-adopt on first launch. The app is Moroccan and
 *  French/Arabic-first, so only these two are picked up from the OS. Any other
 *  locale (German, English, Spanish…) starts in French rather than surprising
 *  the user — de/en stay available through the in-app language selector. */
const AUTO_DETECT_LANGUAGES: LanguageCode[] = ['ar', 'fr'];

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
