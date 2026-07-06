import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard, ScreenContainer, SelectCard } from '@/components/ui';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { colors, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { profile, resetAll } = useAppStore();

  const logout = async () => {
    if (!isDemoMode && supabase) {
      await supabase.auth.signOut();
    }
    resetAll();
    router.replace('/language');
  };

  const diabetesLabel = profile ? t(`wizard.${profile.diabetes_type}`) : '—';

  return (
    <ScreenContainer withTabBarSpace>
      <Text style={styles.title}>{t('profile.title')}</Text>

      <GlassCard style={styles.card}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color={colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile?.name || t('common.appName')}</Text>
            <Text style={styles.caption}>{diabetesLabel}</Text>
          </View>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.medicalProfile')}</Text>
        <InfoRow
          label={t('wizard.targetTitle')}
          value={
            profile ? `${profile.target_low}–${profile.target_high} mg/dL` : '—'
          }
        />
        <InfoRow
          label={t('wizard.carbRatioTitle')}
          value={profile?.carb_ratio ? `1U : ${profile.carb_ratio}g` : '—'}
        />
        <InfoRow
          label={t('wizard.correctionTitle')}
          value={
            profile?.correction_factor ? `${profile.correction_factor} mg/dL` : '—'
          }
        />
        <InfoRow
          label={t('profile.emergency')}
          value={profile?.emergency_contact_name || '—'}
        />
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
        <View style={styles.langList}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectCard
              key={lang.code}
              emoji={lang.flag}
              label={lang.label}
              selected={i18n.language === lang.code}
              onPress={() => setAppLanguage(lang.code as LanguageCode)}
            />
          ))}
        </View>
      </GlassCard>

      <GlassCard style={styles.card} onPress={logout}>
        <View style={styles.row}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logout}>{t('profile.logout')}</Text>
        </View>
      </GlassCard>
    </ScreenContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.display, fontSize: 28 },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.title },
  caption: { ...typography.caption },
  sectionTitle: { ...typography.bodyMedium, color: colors.textSecondary },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoLabel: { ...typography.caption, flex: 1 },
  infoValue: { ...typography.bodyMedium, fontSize: 14 },
  langList: { gap: spacing.sm },
  logout: { ...typography.bodyMedium, color: colors.danger },
});
