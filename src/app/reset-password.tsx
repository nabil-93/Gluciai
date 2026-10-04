import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spinner } from '@/components/ui';
import { supabase, withTimeout } from '@/lib/supabase';
import { signOut } from '@/services/account';
import { accountErrorKey } from '@/services/accountErrors';

const N600 = 'Nunito_600SemiBold';
const N700 = 'Nunito_700Bold';
const N800 = 'Nunito_800ExtraBold';

const MIN_PASSWORD = 6;
const UPDATE_TIMEOUT_MS = 30_000;
/** How long to wait for the e-mail link's session before calling it invalid. */
const LINK_WAIT_MS = 6000;

type LinkState = 'checking' | 'ok' | 'invalid';

/**
 * WHERE THE PASSWORD-RESET E-MAIL LANDS (store audit B-11).
 *
 * Supabase's reset link opens this page with a one-time recovery session in
 * the URL; supabase-js (`detectSessionInUrl` on web) turns it into a session
 * and emits PASSWORD_RECOVERY. The patient picks a new password, and is then
 * signed out here so the next sign-in — in the app or on the web — uses it.
 *
 * Opened without a valid link (expired, already used, typed by hand) it says
 * so and offers a new link instead of a form that cannot work.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState<LinkState>(() => (supabase ? 'checking' : 'invalid'));
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setLink('ok');
    });
    // The URL may already have been consumed before this screen mounted.
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) setLink('ok');
    });
    const timer = setTimeout(() => {
      if (alive) setLink((s) => (s === 'checking' ? 'invalid' : s));
    }, LINK_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const save = async () => {
    setError(null);
    if (pw1.length < MIN_PASSWORD) {
      setError(t('profile.passwordWeak'));
      return;
    }
    if (pw1 !== pw2) {
      setError(t('profile.passwordMismatch'));
      return;
    }
    if (!supabase) return;
    setBusy(true);
    try {
      const outcome = await withTimeout(
        supabase.auth.updateUser({ password: pw1 }),
        UPDATE_TIMEOUT_MS,
        null
      );
      if (!outcome) {
        setError(t('authError.timeout'));
        return;
      }
      if (outcome.error) {
        setError(t(accountErrorKey(outcome.error.message)));
        return;
      }
      setDone(true);
      // The recovery session has done its job; the new password signs in.
      await signOut();
    } finally {
      setBusy(false);
    }
  };

  const goLogin = () => router.replace('/auth?mode=login' as never);

  return (
    <View style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top + 40,
          paddingHorizontal: 26,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
        }}
      >
        <Text style={styles.title}>{t('reset.title')}</Text>

        {link === 'checking' ? (
          <View style={styles.center}>
            <Spinner size={26} color="#1fbc78" />
          </View>
        ) : null}

        {link === 'invalid' && !done ? (
          <>
            <Text style={styles.subtitle}>{t('reset.invalid')}</Text>
            <PrimaryButton label={t('reset.requestNew')} onPress={goLogin} />
          </>
        ) : null}

        {link === 'ok' && !done ? (
          <>
            <Text style={styles.subtitle}>{t('reset.subtitle')}</Text>
            <View style={{ gap: 11 }}>
              <TextInput
                value={pw1}
                onChangeText={setPw1}
                placeholder={t('reset.newPassword')}
                placeholderTextColor="#98a1af"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                style={styles.input}
              />
              <TextInput
                value={pw2}
                onChangeText={setPw2}
                placeholder={t('profile.confirmPassword')}
                placeholderTextColor="#98a1af"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                autoComplete="new-password"
                style={styles.input}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <PrimaryButton label={t('reset.save')} onPress={save} busy={busy} />
          </>
        ) : null}

        {done ? (
          <>
            <Text style={styles.success}>✓ {t('reset.done')}</Text>
            <PrimaryButton label={t('auth.login')} onPress={goLogin} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{ marginTop: 18 }}
      accessibilityRole="button"
    >
      <LinearGradient
        colors={['#2ec983', '#1fbc78']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.cta, busy && { opacity: 0.6 }]}
      >
        {busy ? (
          <Spinner size={22} color="#ffffff" />
        ) : (
          <Text style={styles.ctaText}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fc' },
  center: { alignItems: 'center', marginTop: 30 },
  title: {
    fontFamily: N800,
    fontSize: 26,
    color: '#101a2b',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: N600,
    fontSize: 15,
    lineHeight: 21,
    color: '#5f6b7a',
    textAlign: 'center',
    marginBottom: 18,
  },
  input: {
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    paddingHorizontal: 16,
    fontFamily: N600,
    fontSize: 15.5,
    color: '#101a2b',
  },
  error: { fontFamily: N600, fontSize: 14, color: '#e5484d', marginTop: 10 },
  success: {
    fontFamily: N700,
    fontSize: 16,
    lineHeight: 22,
    color: '#1f9c6a',
    textAlign: 'center',
    marginTop: 10,
  },
  cta: {
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: N700, fontSize: 17, color: '#ffffff' },
});
