import React, { useState } from 'react';
import {
  Image,
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
import { hydrateFromServer } from '@/services/sync';
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
function PhoneIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"
        stroke={GREEN}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
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
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

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
          options: { data: { name, phone } },
        });
        if (err) throw err;
        // The signup trigger created the profile row — attach the phone so
        // the dashboard can reach the patient (WhatsApp renewal reminders).
        if (phone.trim()) {
          const { data: u } = await supabase.auth.getUser();
          if (u.user) {
            await supabase
              .from('profiles')
              .update({ phone: phone.trim(), name: name || undefined })
              .eq('user_id', u.user.id);
          }
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (err) throw err;
        // Pull the account's full history (profile, meals + photos, insulin,
        // glucose, activity, measures, chat) so a fresh install / new phone
        // shows everything the user ever recorded.
        await hydrateFromServer();
      }
      goAfterAuth(!isRegister);
    } catch (e: any) {
      setError(e.message ?? t('common.error'));
    } finally {
      setLoading(false);
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
            <>
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
              <View style={styles.field}>
                <PhoneIcon />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t('auth.phone')}
                  placeholderTextColor="#98a1af"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>
            </>
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
