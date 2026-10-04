import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  LegalContactLine,
  LegalPage,
  LegalSection,
  LEGAL_INK,
  legalStyles,
  useLegalContact,
} from '@/components/LegalPage';
import { Spinner } from '@/components/ui';
import { confirmAsync } from '@/lib/confirm';
import { isDemoMode, supabase, withTimeout } from '@/lib/supabase';
import { deleteAccount } from '@/services/account';
import { accountErrorKey } from '@/services/accountErrors';
import { authErrorKey } from '@/services/authErrors';
import { shadows } from '@/theme';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';

/** Same backstop as the sign-in screen: a call that never answers still ends. */
const AUTH_TIMEOUT_MS = 30_000;

/**
 * PUBLIC ACCOUNT DELETION PAGE (store audit B-10).
 *
 * Google Play requires a web address where a user can delete their account
 * and data without the app installed; this route is that address
 * (https://gluciai.vercel.app/delete-account). It explains the in-app path,
 * lets the patient sign in right here and erase the account through the same
 * `delete-account` edge function the app uses (files first, then the account),
 * and gives a contact for someone who lost access to their account.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const contact = useLegalContact();

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // An existing session on this browser (signed in to the web app) is enough.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS, null).then((r) => {
      const mail = r?.data.session?.user.email ?? null;
      if (alive && mail) setSessionEmail(mail);
    });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = async () => {
    if (!supabase || busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await withTimeout(
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        AUTH_TIMEOUT_MS,
        null
      );
      if (!r) {
        setError(t('authError.timeout'));
        return;
      }
      if (r.error) {
        setError(t(authErrorKey(r.error)));
        return;
      }
      setSessionEmail(r.data.user?.email ?? email.trim());
      setPassword('');
    } catch (e: any) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    if (busy) return;
    const ok = await confirmAsync({
      title: t('deleteAccountPage.confirmTitle'),
      message: t('deleteAccountPage.confirmBody'),
      confirmLabel: t('deleteAccountPage.deleteNow'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      const r = await deleteAccount();
      if (r.ok) {
        setDone(true);
        setSessionEmail(null);
      } else {
        if (__DEV__) console.warn('[delete-account page]', r.error);
        setError(t(accountErrorKey(r.error)));
      }
    } finally {
      setBusy(false);
    }
  };

  const canWeb = !!supabase && !isDemoMode;

  return (
    <LegalPage title={t('deleteAccountPage.title')}>
      <Text style={legalStyles.lead}>{t('deleteAccountPage.intro')}</Text>

      <LegalSection title={t('deleteAccountPage.appT')} body={t('deleteAccountPage.appB')} />

      {done ? (
        <View style={styles.card}>
          <Text style={styles.done}>✓ {t('deleteAccountPage.done')}</Text>
        </View>
      ) : canWeb ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('deleteAccountPage.webT')}</Text>
          {sessionEmail ? (
            <>
              <Text style={legalStyles.body}>
                {t('deleteAccountPage.signedInAs', { email: sessionEmail })}
              </Text>
              <Pressable
                onPress={erase}
                disabled={busy}
                style={[styles.dangerBtn, busy && styles.btnBusy]}
                accessibilityRole="button"
              >
                {busy ? (
                  <Spinner size={20} color="#ffffff" />
                ) : (
                  <Text style={styles.btnText}>{t('deleteAccountPage.deleteNow')}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={legalStyles.body}>{t('deleteAccountPage.webB')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.email')}
                placeholderTextColor="#98a1af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                autoComplete="email"
                style={styles.input}
              />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password')}
                placeholderTextColor="#98a1af"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="current-password"
                style={styles.input}
                onSubmitEditing={signIn}
              />
              <Pressable
                onPress={signIn}
                disabled={busy || !email.trim() || !password}
                style={[
                  styles.primaryBtn,
                  (busy || !email.trim() || !password) && styles.btnBusy,
                ]}
                accessibilityRole="button"
              >
                {busy ? (
                  <Spinner size={20} color="#ffffff" />
                ) : (
                  <Text style={styles.btnText}>{t('deleteAccountPage.signIn')}</Text>
                )}
              </Pressable>
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('deleteAccountPage.noAccessT')}</Text>
        <Text style={legalStyles.body}>{t('deleteAccountPage.noAccessB')}</Text>
        <LegalContactLine label={t('deleteAccountPage.contactLabel')} contact={contact} />
      </View>

      <Pressable
        onPress={() => router.push('/privacy' as never)}
        style={styles.privacyLink}
        accessibilityRole="link"
      >
        <Text style={legalStyles.link}>{t('deleteAccountPage.privacyLink')}</Text>
      </Pressable>
    </LegalPage>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    gap: 10,
    ...shadows.card,
  },
  cardTitle: { fontFamily: F700, fontSize: 15.5, color: LEGAL_INK },
  input: {
    height: 50,
    backgroundColor: '#f2f4f7',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: F600,
    fontSize: 15,
    color: LEGAL_INK,
  },
  primaryBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#1fbc78',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#d92d20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBusy: { opacity: 0.55 },
  btnText: { fontFamily: F700, fontSize: 15.5, color: '#ffffff' },
  error: { fontFamily: F600, fontSize: 13.5, color: '#d92d20' },
  done: { fontFamily: F700, fontSize: 15, lineHeight: 21, color: '#1f9c6a' },
  privacyLink: { alignSelf: 'center', marginTop: 18, padding: 8 },
});
