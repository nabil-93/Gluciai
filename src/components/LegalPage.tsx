import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from '@/components/ui';
import { LEGAL_CONTACT_EMAIL, LEGAL_OWNER } from '@/config/links';
import { hasWhatsappSupport, whatsappUrl } from '@/config/support';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

export const LEGAL_INK = '#101828';
export const LEGAL_MUTED = '#5f6b7a';
export const LEGAL_LINK = '#2f7cf6';

/** Who the policy names as data controller (see config/links). */
export const legalOwner = (): string => LEGAL_OWNER.trim() || 'GluciAI';

/**
 * The contact a patient uses for anything about their data: the owner's
 * e-mail once configured, the WhatsApp support line until then.
 */
export function useLegalContact(): { label: string; open: (() => void) | null } {
  const { t } = useTranslation();
  const email = LEGAL_CONTACT_EMAIL.trim();
  if (email) {
    return { label: email, open: () => void Linking.openURL(`mailto:${email}`).catch(() => {}) };
  }
  if (hasWhatsappSupport()) {
    return {
      label: t('legal.contactWhatsapp'),
      open: () => void Linking.openURL(whatsappUrl()).catch(() => {}),
    };
  }
  return { label: legalOwner(), open: null };
}

/**
 * Scaffold shared by the public legal pages (/privacy, /delete-account).
 * Both are reachable WITHOUT an account — they are the URLs given to the App
 * Store and Google Play — so the back button falls back to the app root.
 */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 18,
          paddingBottom: Math.max(insets.bottom, 12) + 28,
        }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.headRow}>
          <Pressable onPress={back} style={styles.backBtn} accessibilityRole="button" hitSlop={8}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}

/** "Contact: <link>" — the link is its own element, never spliced into a sentence. */
export function LegalContactLine({
  label,
  contact,
}: {
  label: string;
  contact: { label: string; open: (() => void) | null };
}) {
  return (
    <Text style={legalStyles.body}>
      {label}{' '}
      {contact.open ? (
        <Text style={legalStyles.link} onPress={contact.open} accessibilityRole="link">
          {contact.label}
        </Text>
      ) : (
        contact.label
      )}
    </Text>
  );
}

export function LegalSection({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

export const legalStyles = StyleSheet.create({
  lead: { fontFamily: F500, fontSize: 14.5, lineHeight: 21, color: LEGAL_MUTED, marginTop: 6 },
  small: { fontFamily: F600, fontSize: 12, color: LEGAL_MUTED, marginTop: 4 },
  link: { fontFamily: F700, color: LEGAL_LINK },
  body: { fontFamily: F500, fontSize: 14, lineHeight: 21, color: LEGAL_INK },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fc' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { flex: 1, fontFamily: F800, fontSize: 20, color: LEGAL_INK },
  section: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    gap: 6,
    ...shadows.card,
  },
  sectionTitle: { fontFamily: F800, fontSize: 15.5, color: LEGAL_INK },
  body: { fontFamily: F500, fontSize: 14, lineHeight: 21, color: '#344054' },
});
