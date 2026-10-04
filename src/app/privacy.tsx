import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  LegalContactLine,
  LegalPage,
  LegalSection,
  LEGAL_INK,
  legalOwner,
  legalStyles,
  useLegalContact,
} from '@/components/LegalPage';
import { POLICY_UPDATED } from '@/config/links';
import { CONSENT_IDS, CONSENT_META } from '@/data/consent';
import { shadows } from '@/theme';

const F700 = 'PlusJakartaSans_700Bold';

/** Policy sections, in reading order (keys under `legal.*`). */
const SECTIONS = [
  'collect',
  'use',
  'base',
  'processors',
  'doctor',
  'keep',
  'rights',
  'security',
  'minors',
  'medical',
  'changes',
] as const;

/**
 * PRIVACY POLICY (store audit B-05).
 *
 * Apple 5.1.1(i) and Google Play both require a privacy policy reachable from
 * the store listing AND inside the app. This screen is both: on the web build
 * it is the public page https://gluciai.vercel.app/privacy (no account
 * needed), and in the app it opens from Profil → Confidentialité. It also
 * gathers the four consents the patient accepted, so "re-read them at any
 * time" (consent.footer) is true, and links to account deletion — the way
 * consent is withdrawn.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const contact = useLegalContact();

  const [y, m, d] = POLICY_UPDATED.split('-').map(Number);
  const updated = new Date(y, m - 1, d).toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <LegalPage title={t('legal.title')}>
      <Text style={legalStyles.small}>{t('legal.updated', { date: updated })}</Text>
      <Text style={legalStyles.lead}>{t('legal.intro')}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('legal.controllerT')}</Text>
        <Text style={legalStyles.body}>{t('legal.controllerB', { owner: legalOwner() })}</Text>
        <LegalContactLine label={t('legal.controllerContact')} contact={contact} />
      </View>

      {SECTIONS.map((s) => (
        <LegalSection key={s} title={t(`legal.${s}T`)} body={t(`legal.${s}B`)} />
      ))}

      <Text style={styles.groupTitle}>{t('legal.consentsT')}</Text>
      <View style={styles.list}>
        {CONSENT_IDS.map((id, i) => (
          <Pressable
            key={id}
            onPress={() => router.push(`/consent-detail?id=${id}` as never)}
            style={[styles.row, i > 0 && styles.rowBorder]}
            accessibilityRole="button"
          >
            <Text style={styles.rowIcon}>{CONSENT_META[id].icon}</Text>
            <Text style={styles.rowText} numberOfLines={2}>
              {t(`consent.${id}Title`)}
            </Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => router.push('/delete-account' as never)}
        style={styles.deleteBtn}
        accessibilityRole="button"
      >
        <Text style={styles.deleteText}>{t('legal.deleteLink')}</Text>
      </Pressable>
    </LegalPage>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    gap: 6,
    ...shadows.card,
  },
  cardTitle: { fontFamily: F700, fontSize: 15.5, color: LEGAL_INK },
  groupTitle: { fontFamily: F700, fontSize: 13, color: '#5f6b7a', marginTop: 22, marginBottom: 8 },
  list: { backgroundColor: '#ffffff', borderRadius: 18, ...shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e4e7ec' },
  rowIcon: { fontSize: 18 },
  rowText: { flex: 1, fontFamily: F700, fontSize: 14, color: LEGAL_INK },
  chev: { fontFamily: F700, fontSize: 20, color: '#98a2b3' },
  deleteBtn: {
    marginTop: 18,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  deleteText: { fontFamily: F700, fontSize: 14.5, color: '#d92d20' },
});
