import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { LegalPage, legalStyles } from '@/components/LegalPage';
import { shadows } from '@/theme';

const F700 = 'PlusJakartaSans_700Bold';

/** Supabase reports a failed link in the URL (#error=…&error_code=…). */
const urlHasError = (): boolean =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  /(^|[#&?])error(_code|_description)?=/.test(window.location.hash + window.location.search);

/* Read once at load as well: supabase-js processes (and may clean) the URL
   fragment during its own start-up, before this screen first renders. */
const URL_HAD_ERROR_AT_LOAD = urlHasError();

/**
 * WHERE THE SIGN-UP CONFIRMATION LINK LANDS (store audit S-05).
 *
 * The link is opened in whatever browser the patient's mail app uses — not
 * necessarily on the phone that holds their onboarding answers. So this page
 * does not try to continue the onboarding: it confirms, and sends the patient
 * back to the app to sign in, where the first sync pushes the answers kept on
 * that phone. A link that has expired or was already used says so.
 */
export default function EmailConfirmedScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const failed = URL_HAD_ERROR_AT_LOAD || urlHasError();

  return (
    <LegalPage title={failed ? t('emailConfirmed.failedTitle') : t('emailConfirmed.title')}>
      <View style={styles.card}>
        <Text style={styles.icon}>{failed ? '⚠️' : '✅'}</Text>
        <Text style={legalStyles.body}>
          {failed ? t('emailConfirmed.failedBody') : t('emailConfirmed.body')}
        </Text>
      </View>
      <Pressable
        onPress={() => router.replace('/auth?mode=login' as never)}
        style={styles.btn}
        accessibilityRole="button"
      >
        <Text style={styles.btnText}>{t('emailConfirmed.signIn')}</Text>
      </Pressable>
    </LegalPage>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 10,
    alignItems: 'center',
    ...shadows.card,
  },
  icon: { fontSize: 34 },
  btn: {
    marginTop: 18,
    height: 52,
    borderRadius: 15,
    backgroundColor: '#1fbc78',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontFamily: F700, fontSize: 16, color: '#ffffff' },
});

