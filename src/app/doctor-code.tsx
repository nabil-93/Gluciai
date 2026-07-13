import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import { confirmAsync } from '@/lib/confirm';
import { isDemoMode, supabase } from '@/lib/supabase';
import { saveProfile } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

function StethoscopeIcon({ color = '#4f46e5' }: { color?: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 3v5a4 4 0 0 0 8 0V3M4 3h3M13 3h3M10 15v1a5 5 0 0 0 10 0v-2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M20 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

/**
 * Doctor-code screen — reachable from the profile. A patient enters the
 * code their doctor gave them; after they consent, `redeem_promo_code`
 * links the account to that doctor (who then sees them in the dashboard)
 * and applies the subscription discount.
 */
export default function DoctorCodeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const profile = useAppStore((s) => s.profile);

  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  const [doctor, setDoctor] = useState(profile?.doctor_name ?? '');

  const linked = state === 'ok' || !!profile?.doctor_name;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const apply = async () => {
    const c = code.trim();
    if (!c || state === 'checking') return;
    if (isDemoMode || !supabase) {
      setState('bad');
      return;
    }
    // Consent: linking to a doctor gives them read access to health data.
    const agreed = await confirmAsync({
      title: t('coupon.consentTitle'),
      message: t('coupon.consentBody'),
      confirmLabel: t('coupon.consentAccept'),
      cancelLabel: t('profile.cancel'),
    });
    if (!agreed) return;

    setState('checking');
    try {
      const { data, error } = await supabase.rpc('redeem_promo_code', { p_code: c });
      if (error || !data?.ok) {
        setState('bad');
        return;
      }
      const docName = String(data.doctor || '');
      setDoctor(docName);
      setState('ok');
      setCode('');
      // Persist the doctor's name locally + on the profile row.
      if (profile) await saveProfile({ ...profile, doctor_name: docName || profile.doctor_name });
    } catch {
      setState('bad');
    }
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={close} style={styles.backBtn}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>{t('coupon.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: insets.bottom + 30 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <StethoscopeIcon />
          </View>
          <Text style={styles.heroTitle}>{t('coupon.heroTitle')}</Text>
          <Text style={styles.heroSub}>{t('coupon.heroSub')}</Text>
        </View>

        {linked && doctor ? (
          <View style={styles.linkedCard}>
            <Text style={{ fontSize: 22 }}>🩺</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.linkedLabel}>{t('coupon.followedBy')}</Text>
              <Text style={styles.linkedDoctor} numberOfLines={1}>
                {t('coupon.doctorPrefix')} {doctor}
              </Text>
            </View>
            <View style={styles.linkedCheck}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M5 12.5l4.2 4.2L19 7" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          </View>
        ) : null}

        {/* Code entry */}
        <Text style={styles.label}>
          {linked ? t('coupon.changeLabel') : t('coupon.enterLabel')}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (state === 'bad') setState('idle');
            }}
            placeholder={t('coupon.placeholder')}
            placeholderTextColor="#9aa4b2"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={apply}
            disabled={!code.trim() || state === 'checking'}
            style={{ opacity: !code.trim() || state === 'checking' ? 0.5 : 1 }}
          >
            <LinearGradient
              colors={['#6366f1', '#4f46e5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.applyBtn}
            >
              <Text style={styles.applyText}>
                {state === 'checking' ? '…' : t('coupon.apply')}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {state === 'bad' ? (
          <Text style={styles.bad}>{t('coupon.invalid')}</Text>
        ) : state === 'ok' ? (
          <Text style={styles.good}>{t('coupon.success')}</Text>
        ) : null}

        {/* What the doctor can see */}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>{t('coupon.seeTitle')}</Text>
          {['seeMeals', 'seeGlucose', 'seeInsulin', 'seeReport'].map((k) => (
            <View key={k} style={styles.noteRow}>
              <View style={styles.noteDot} />
              <Text style={styles.noteText}>{t(`coupon.${k}`)}</Text>
            </View>
          ))}
          <Text style={styles.noteFoot}>{t('coupon.privacyNote')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headerTitle: { fontFamily: F800, fontSize: 17, color: '#101a2b' },

  hero: { alignItems: 'center', marginTop: 6, marginBottom: 22 },
  heroBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#eef0ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: { fontFamily: F800, fontSize: 20, color: '#101a2b', textAlign: 'center' },
  heroSub: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 7,
    maxWidth: 300,
  },

  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#eef0ff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
  },
  linkedLabel: { fontFamily: F600, fontSize: 11.5, color: '#6d6fd6' },
  linkedDoctor: { fontFamily: F800, fontSize: 15, color: '#3730a3', marginTop: 2 },
  linkedCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#5f6b7a',
    marginBottom: 9,
    marginLeft: 2,
  },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    paddingHorizontal: 16,
    fontFamily: F700,
    fontSize: 15,
    letterSpacing: 1,
    color: '#101a2b',
    ...shadows.card,
  },
  applyBtn: {
    height: 52,
    paddingHorizontal: 22,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { fontFamily: F800, fontSize: 14.5, color: '#ffffff' },
  bad: { fontFamily: F600, fontSize: 12.5, color: '#c0410b', marginTop: 10, marginLeft: 2 },
  good: { fontFamily: F600, fontSize: 12.5, color: '#0f7a45', marginTop: 10, marginLeft: 2 },

  noteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    marginTop: 24,
    ...shadows.card,
  },
  noteTitle: { fontFamily: F800, fontSize: 13.5, color: '#101a2b', marginBottom: 12 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 },
  noteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4f46e5' },
  noteText: { fontFamily: F500, fontSize: 13, color: '#3b4657' },
  noteFoot: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#9aa4b2',
    marginTop: 8,
  },
});
