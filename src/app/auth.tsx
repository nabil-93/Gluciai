import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

const N500 = 'Nunito_500Medium';
const N600 = 'Nunito_600SemiBold';
const N700 = 'Nunito_700Bold';
const N800 = 'Nunito_800ExtraBold';

const HERO_ACCOUNT = require('../assets/nfss/il_account.png');

const GREEN = '#1fbc78';

type Mode = 'login' | 'register';

/* ── Field icons (green stroke, from the design) ── */
function UserIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" stroke={GREEN} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
function MailIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={3} y={5} width={18} height={14} rx={2.5} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M4 7l8 6 8-6" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function LockIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={5} y={10} width={14} height={10} rx={2.5} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M8 10V8a4 4 0 018 0v2" stroke={GREEN} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
function EyeIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="#8a93a3"
        strokeWidth={2}
        fill="none"
      />
      <Circle cx={12} cy={12} r={3} stroke="#8a93a3" strokeWidth={2} fill="none" />
    </Svg>
  );
}
function GoogleIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45 24c0-1.5-.1-3-.4-4.4H24v8.4h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1C42.7 36.3 45 30.7 45 24z" />
      <Path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z" />
      <Path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5C3 17 2 20.4 2 24s1 7 2.5 10z" />
      <Path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-8.9 12.2-8.9z" />
    </Svg>
  );
}
function AppleIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        fill="#0b0b0d"
        d="M17.05 12.5c0-2 1.6-3 1.7-3-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2.1 2.5 2 1-.04 1.4-.6 2.6-.6s1.5.6 2.6.6c1.1-.02 1.8-1 2.5-2 .5-.7.8-1.4 1-1.6-.02-.01-1.9-.7-1.9-2.9z"
      />
      <Path
        fill="#0b0b0d"
        d="M15.3 6.2c.5-.7.9-1.6.8-2.5-.8.03-1.8.5-2.4 1.2-.5.6-1 1.5-.8 2.4.9.07 1.8-.4 2.4-1.1z"
      />
    </Svg>
  );
}
function ShieldIcon({ color = '#5fbf8f', size = 15 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function AuthScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setWizardDone = useAppStore((s) => s.setWizardDone);
  const [mode, setMode] = useState<Mode>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  // OAuth (Google/Apple) on web redirects away and back to this screen with
  // a session in the URL. Once Supabase has picked it up, a signed-in user
  // has already onboarded → send them straight to the dashboard.
  useEffect(() => {
    if (isDemoMode || !supabase || Platform.OS !== 'web') return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setWizardDone();
        router.replace('/(tabs)');
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New sign-ups fill their medical profile first; returning users who log
  // in already have one, so they skip straight to the dashboard.
  const goAfterAuth = (returning: boolean) => {
    if (returning) {
      setWizardDone();
      router.replace('/(tabs)');
    } else {
      router.replace('/wizard');
    }
  };

  const submit = async () => {
    setError(null);
    // Demo mode: no backend — register still shows the wizard; a demo
    // "login" jumps straight to the dashboard.
    if (isDemoMode || !supabase) {
      goAfterAuth(!isRegister);
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
      }
      goAfterAuth(!isRegister);
    } catch (e: any) {
      setError(e.message ?? t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const social = async (provider: 'google' | 'apple') => {
    setError(null);
    // Demo mode (no backend): continue directly so the flow stays usable.
    if (isDemoMode || !supabase) {
      goAfterAuth(!isRegister);
      return;
    }
    try {
      if (Platform.OS === 'web') {
        // OAuth on web redirects the browser to the provider and back to
        // the app URL, where detectSessionInUrl picks up the session.
        const { error: err } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.origin },
        });
        if (err) throw err;
      } else {
        // Native OAuth needs the expo-auth-session / deep-link setup; until
        // that's wired, tell the user instead of silently doing nothing.
        Alert.alert(t('auth.comingSoon'));
      }
    } catch (e: any) {
      setError(e.message ?? t('common.error'));
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 26,
          paddingBottom: Math.max(insets.bottom, 12) + 14,
        }}
      >
        {/* Hero */}
        <View style={{ alignItems: 'center' }}>
          <Image
            source={HERO_ACCOUNT}
            style={styles.hero}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>
          {isRegister ? t('auth.createAccount') : t('auth.welcomeBack')}
        </Text>
        <Text style={styles.subtitle}>
          {isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}
        </Text>

        {/* Fields */}
        <View style={{ gap: 11 }}>
          {isRegister ? (
            <View style={styles.field}>
              <UserIcon />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('auth.name')}
                placeholderTextColor="#98a1af"
                autoCapitalize="words"
                style={styles.input}
              />
            </View>
          ) : null}
          <View style={styles.field}>
            <MailIcon />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.email')}
              placeholderTextColor="#98a1af"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <LockIcon />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={t('auth.password')}
              placeholderTextColor="#98a1af"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              style={styles.input}
            />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
              <EyeIcon />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Demo note */}
        {isDemoMode ? (
          <View style={styles.demoRow}>
            <ShieldIcon color="#ef8a3c" size={16} />
            <Text style={styles.demoText}>{t('common.demoBadge')}</Text>
          </View>
        ) : (
          <View style={{ height: 12 }} />
        )}

        {/* CTA */}
        <Pressable onPress={submit} disabled={loading}>
          <LinearGradient
            colors={['#2ec983', '#1fbc78']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, loading && { opacity: 0.6 }]}
          >
            <Text style={styles.ctaText}>
              {isRegister ? t('auth.register') : t('auth.login')}
            </Text>
          </LinearGradient>
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('auth.orDivider')}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social */}
        <View style={{ gap: 11 }}>
          <Pressable style={styles.socialBtn} onPress={() => social('google')}>
            <GoogleIcon />
            <Text style={styles.socialText}>{t('auth.continueWithGoogle')}</Text>
          </Pressable>
          <Pressable style={styles.socialBtn} onPress={() => social('apple')}>
            <AppleIcon />
            <Text style={styles.socialText}>{t('auth.continueWithApple')}</Text>
          </Pressable>
        </View>

        {/* Switch mode */}
        <Pressable
          onPress={() => setMode(isRegister ? 'login' : 'register')}
          hitSlop={8}
        >
          <Text style={styles.switchText}>
            {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <Text style={styles.switchLink}>
              {isRegister ? t('auth.login') : t('auth.register')}
            </Text>
          </Text>
        </Pressable>

        {/* Security note */}
        <View style={styles.securityRow}>
          <ShieldIcon />
          <Text style={styles.securityText}>{t('auth.securityNote')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fc' },
  hero: { width: '64%', maxWidth: 260, height: 150 },
  title: {
    fontFamily: N800,
    fontSize: 27,
    letterSpacing: -0.4,
    color: '#101a2b',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: N600,
    fontSize: 15,
    color: '#5f6b7a',
    textAlign: 'center',
    marginBottom: 18,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    paddingHorizontal: 16,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  input: {
    flex: 1,
    fontFamily: N600,
    fontSize: 15.5,
    color: '#101a2b',
    padding: 0,
  },
  error: {
    fontFamily: N600,
    fontSize: 14,
    color: '#e5484d',
    marginTop: 10,
    marginLeft: 2,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  demoText: {
    flex: 1,
    fontFamily: N600,
    fontSize: 14.5,
    color: '#ef8a3c',
  },
  cta: {
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1fbc78',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 8,
  },
  ctaText: { fontFamily: N700, fontSize: 17, color: '#ffffff' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#dfe3ea' },
  dividerText: { fontFamily: N600, fontSize: 14, color: '#98a1af' },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  socialText: { fontFamily: N700, fontSize: 15.5, color: '#2b3442' },
  switchText: {
    fontFamily: N600,
    fontSize: 14.5,
    color: '#5f6b7a',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  switchLink: { fontFamily: N800, color: '#2f7cf6' },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  securityText: {
    fontFamily: N500,
    fontSize: 12.5,
    lineHeight: 17.5,
    color: '#98a1af',
    textAlign: 'center',
  },
});
