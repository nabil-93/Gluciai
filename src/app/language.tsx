import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ScreenContainer, SelectCard } from '@/components/ui';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing } from '@/theme';

export default function LanguageScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const setLanguageChosen = useAppStore((s) => s.setLanguageChosen);

  const choose = async (code: LanguageCode) => {
    await setAppLanguage(code);
    setLanguageChosen();
    router.replace('/onboarding');
  };

  return (
    <ScreenContainer scroll={false} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>G</Text>
        </View>
        <Text style={styles.appName}>GLUCOAI</Text>
        <Text style={styles.title}>{t('language.title')}</Text>
        <Text style={styles.subtitle}>{t('language.subtitle')}</Text>
      </View>

      <View style={styles.list}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectCard
            key={lang.code}
            emoji={lang.flag}
            label={lang.label}
            selected={i18n.language === lang.code}
            onPress={() => choose(lang.code)}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  header: { alignItems: 'center', gap: spacing.sm },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: '#33333A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: '#141420',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  badgeText: {
    fontSize: 38,
    fontWeight: '800',
    fontStyle: 'italic',
    color: '#F4F4F6',
  },
  appName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.textSecondary,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: { gap: spacing.md },
});
