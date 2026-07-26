import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui';
import { confirmAsync } from '@/lib/confirm';
import { isDemoMode, supabase } from '@/lib/supabase';
import { saveProfile } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#14231C';
const MUTED = '#63736A';

/**
 * Linking to a doctor, where the patient looks for it.
 *
 * This used to be a row that pushed a separate screen, so "who follows me"
 * lived in one place and "the code that decides it" in another. It is one
 * thing, and it belongs in Mon médecin.
 *
 * The unlink is not a nicety: the consent the patient accepts says they can
 * withdraw at any time, and until now nothing in the app could do it.
 */
export function DoctorLinkCard() {
  const { t } = useTranslation();
  const profile = useAppStore((s) => s.profile);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'link' | 'unlink' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doctor, setDoctor] = useState(profile?.doctor_name ?? '');

  const linked = !!doctor;

  const apply = async () => {
    const c = code.trim();
    if (!c || busy) return;
    setError(null);
    if (isDemoMode || !supabase) {
      setError(t('coupon.invalid'));
      return;
    }
    // Consent: linking gives the doctor read access to health data.
    const agreed = await confirmAsync({
      title: t('coupon.consentTitle'),
      message: t('coupon.consentBody'),
      confirmLabel: t('coupon.consentAccept'),
      cancelLabel: t('profile.cancel'),
    });
    if (!agreed) return;

    setBusy('link');
    try {
      const { data, error: rpcErr } = await supabase.rpc('redeem_promo_code', { p_code: c });
      if (rpcErr || !data?.ok) {
        setError(t('coupon.invalid'));
        return;
      }
      const name = String(data.doctor || '');
      setDoctor(name);
      setCode('');
      if (profile) await saveProfile({ ...profile, doctor_name: name || profile.doctor_name });
    } catch {
      setError(t('coupon.invalid'));
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    if (busy) return;
    const agreed = await confirmAsync({
      title: t('coupon.unlinkTitle'),
      message: t('coupon.unlinkBody'),
      confirmLabel: t('coupon.unlinkConfirm'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (!agreed) return;

    setBusy('unlink');
    setError(null);
    try {
      if (!isDemoMode && supabase) {
        const { data, error: rpcErr } = await supabase.rpc('unlink_my_doctor');
        if (rpcErr || !data?.ok) {
          setError(t('coupon.unlinkFailed'));
          return;
        }
      }
      setDoctor('');
      if (profile) await saveProfile({ ...profile, doctor_name: undefined });
    } catch {
      setError(t('coupon.unlinkFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Text style={{ fontSize: 17 }}>🩺</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('coupon.rowTitle')}</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {linked ? `${t('coupon.followedBy')} ${t('coupon.doctorPrefix')} ${doctor}` : t('coupon.heroSub')}
          </Text>
        </View>
      </View>

      {linked ? (
        <>
          <View style={styles.linkedRow}>
            <View style={styles.dot} />
            <Text style={styles.linkedText} numberOfLines={1}>
              {t('coupon.doctorPrefix')} {doctor}
            </Text>
            <Pressable onPress={unlink} disabled={!!busy} style={styles.unlinkBtn}>
              {busy === 'unlink' ? (
                <Spinner size={15} color="#B3261E" />
              ) : (
                <Text style={styles.unlinkText}>{t('coupon.unlink')}</Text>
              )}
            </Pressable>
          </View>
          <Text style={styles.note}>{t('coupon.privacyNote')}</Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('coupon.enterLabel')}</Text>
          <View style={styles.row}>
            <TextInput
              value={code}
              onChangeText={(v) => {
                setCode(v.toUpperCase());
                setError(null);
              }}
              placeholder={t('coupon.placeholder')}
              placeholderTextColor="#AFBAB3"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            <Pressable
              onPress={apply}
              disabled={!code.trim() || !!busy}
              style={[styles.applyBtn, (!code.trim() || !!busy) && { opacity: 0.5 }]}
            >
              {busy === 'link' ? (
                <Spinner size={16} color="#fff" />
              ) : (
                <Text style={styles.applyText}>{t('coupon.apply')}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E7EDE9',
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F800, fontSize: 14, color: INK },
  sub: { fontFamily: F500, fontSize: 11.5, lineHeight: 16, color: MUTED, marginTop: 2 },

  label: { fontFamily: F700, fontSize: 11.5, color: MUTED },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#F8FBF9',
    paddingHorizontal: 14,
    fontFamily: F700,
    fontSize: 15,
    letterSpacing: 1,
    color: INK,
  },
  applyBtn: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { fontFamily: F700, fontSize: 13.5, color: '#FFFFFF' },

  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#E9FBF2',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  linkedText: { flex: 1, minWidth: 0, fontFamily: F700, fontSize: 13, color: '#0F7A42' },
  unlinkBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F4C4C0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlinkText: { fontFamily: F700, fontSize: 11.5, color: '#B3261E' },

  note: { fontFamily: F500, fontSize: 10.5, lineHeight: 15, color: MUTED },
  error: { fontFamily: F600, fontSize: 12, color: colors.danger },
});
