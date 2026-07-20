import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import { changePassword, deleteAccount } from '@/services/account';
import { saveProfile } from '@/services/data';
import { confirmAsync, notify } from '@/lib/confirm';
import { useAppStore } from '@/store/useAppStore';
import type { DiabetesType, InsulinType, Profile } from '@/types';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#0C1D16';
const MUTED = '#8CA097';
const GREEN = '#21C57E';

const GENDERS: Profile['gender'][] = ['male', 'female'];
const DIABETES: DiabetesType[] = ['type1', 'type2', 'gestational', 'prediabetes'];
const INSULINS: InsulinType[] = ['rapid', 'long', 'mixed'];

type Section =
  | 'personal'
  | 'medical'
  | 'doctor'
  | 'emergency'
  | 'security'
  | 'language';

/** Auto-mask a typed birth date: digits only, dashes inserted for the
 *  user (1990 01 31 → "1990-01-31"), so they just keep typing numbers. */
const maskDate = (raw: string) => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

const BackIcon = () => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <Path d="m15 18-6-6 6-6" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export default function ProfileEditScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ section?: string }>();
  const profile = useAppStore((s) => s.profile);
  const wizardDone = useAppStore((s) => s.wizardDone);

  const section: Section = (
    ['personal', 'medical', 'doctor', 'emergency', 'security', 'language'] as const
  ).includes(params.section as Section)
    ? (params.section as Section)
    : 'personal';

  const [draft, setDraft] = useState<Profile | null>(() => profile);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!profile || !draft)
    return <Redirect href={wizardDone ? '/(tabs)' : '/auth'} />;

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const setNum = (key: keyof Profile, text: string) => {
    const n = parseFloat(text.replace(',', '.'));
    set(key, (Number.isFinite(n) ? n : undefined) as Profile[keyof Profile]);
  };

  const toggleInsulin = (kind: InsulinType) => {
    const cur = draft.insulin_types ?? [];
    set(
      'insulin_types',
      cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]
    );
  };

  const onSave = async () => {
    setBusy(true);
    try {
      await saveProfile(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setBusy(false);
    }
  };

  const onChangePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 6) {
      setPwMsg({ ok: false, text: t('profile.passwordWeak') });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ ok: false, text: t('profile.passwordMismatch') });
      return;
    }
    setBusy(true);
    try {
      const r = await changePassword(pw1);
      if (r.ok) {
        setPw1('');
        setPw2('');
        setPwMsg({ ok: true, text: t('profile.passwordChanged') });
      } else {
        setPwMsg({ ok: false, text: r.error ?? t('profile.error') });
      }
    } finally {
      setBusy(false);
    }
  };

  const onLanguage = async (code: LanguageCode) => {
    await setAppLanguage(code);
    set('language', code);
    await saveProfile({ ...draft, language: code });
  };

  const onDelete = async () => {
    const ok = await confirmAsync({
      title: t('profile.deleteConfirmTitle'),
      message: t('profile.deleteConfirmBody'),
      confirmLabel: t('profile.deleteAccount'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const r = await deleteAccount();
    setBusy(false);
    if (r.ok) {
      try {
        router.dismissAll();
      } catch {}
      router.replace('/auth');
    } else notify(t('profile.error'), r.error ?? '');
  };

  const titles: Record<Section, string> = {
    personal: t('profile.sectionPersonal'),
    medical: t('profile.sectionMedical'),
    doctor: t('profile.sectionDoctor'),
    emergency: t('profile.sectionEmergency'),
    security: t('profile.sectionSecurity'),
    language: t('profile.sectionLanguages'),
  };

  const showSave =
    section === 'personal' ||
    section === 'medical' ||
    section === 'doctor' ||
    section === 'emergency';

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerBtn}>
          <BackIcon />
        </Pressable>
        <Text style={styles.headerTitle}>{titles[section]}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 30,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {section === 'personal' ? (
            <>
              <Field
                label={t('profile.name')}
                value={draft.name ?? ''}
                onChangeText={(v) => set('name', v)}
                autoCapitalize="words"
              />
              <Field
                label={t('profile.birthDate')}
                value={draft.birth_date ?? ''}
                onChangeText={(v) => set('birth_date', maskDate(v))}
                placeholder={t('profile.birthDatePlaceholder')}
                keyboardType="number-pad"
                maxLength={10}
              />
              <FieldLabel>{t('profile.gender')}</FieldLabel>
              <View style={styles.chipRow}>
                {GENDERS.map((g) => (
                  <Chip
                    key={g}
                    label={t(`profile.${g}`)}
                    active={draft.gender === g}
                    onPress={() => set('gender', g)}
                  />
                ))}
              </View>
              <View style={styles.row2}>
                <Field
                  flex
                  label={t('profile.height')}
                  value={draft.height != null ? String(draft.height) : ''}
                  onChangeText={(v) => setNum('height', v)}
                  keyboardType="numeric"
                />
                <Field
                  flex
                  label={t('profile.weight')}
                  value={draft.weight != null ? String(draft.weight) : ''}
                  onChangeText={(v) => setNum('weight', v)}
                  keyboardType="numeric"
                />
              </View>
            </>
          ) : null}

          {section === 'medical' ? (
            <>
              <FieldLabel>{t('profile.diabetesType')}</FieldLabel>
              <View style={styles.chipRow}>
                {DIABETES.map((d) => (
                  <Chip
                    key={d}
                    label={t(`profile.${d}`)}
                    active={draft.diabetes_type === d}
                    onPress={() => set('diabetes_type', d)}
                  />
                ))}
              </View>
              <FieldLabel>{t('profile.insulinTypes')}</FieldLabel>
              <View style={styles.chipRow}>
                {INSULINS.map((k) => (
                  <Chip
                    key={k}
                    label={t(`profile.${k}`)}
                    active={(draft.insulin_types ?? []).includes(k)}
                    onPress={() => toggleInsulin(k)}
                  />
                ))}
              </View>
              <View style={styles.row2}>
                <Field
                  flex
                  label={t('profile.targetLow')}
                  value={String(draft.target_low ?? '')}
                  onChangeText={(v) => setNum('target_low', v)}
                  keyboardType="numeric"
                />
                <Field
                  flex
                  label={t('profile.targetHigh')}
                  value={String(draft.target_high ?? '')}
                  onChangeText={(v) => setNum('target_high', v)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.row2}>
                <Field
                  flex
                  label={t('profile.carbRatio')}
                  value={draft.carb_ratio != null ? String(draft.carb_ratio) : ''}
                  onChangeText={(v) => setNum('carb_ratio', v)}
                  keyboardType="numeric"
                />
                <Field
                  flex
                  label={t('profile.correctionFactor')}
                  value={
                    draft.correction_factor != null
                      ? String(draft.correction_factor)
                      : ''
                  }
                  onChangeText={(v) => setNum('correction_factor', v)}
                  keyboardType="numeric"
                />
              </View>
            </>
          ) : null}

          {section === 'doctor' ? (
            <>
              <Field
                label={t('profile.doctorName')}
                value={draft.doctor_name ?? ''}
                onChangeText={(v) => set('doctor_name', v)}
              />
              <Field
                label={t('profile.doctorPhone')}
                value={draft.doctor_phone ?? ''}
                onChangeText={(v) => set('doctor_phone', v)}
                keyboardType="phone-pad"
              />
              <Pressable
                onPress={() => router.push('/doctor-code' as any)}
                style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.linkIcon}>
                  <Text style={{ fontSize: 18 }}>🩺</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.linkTitle}>{t('coupon.rowTitle')}</Text>
                  <Text style={styles.linkSub} numberOfLines={2}>
                    {draft.doctor_name
                      ? `${t('coupon.doctorPrefix')} ${draft.doctor_name}`
                      : t('coupon.rowSub')}
                  </Text>
                </View>
                <Text style={styles.linkArrow}>›</Text>
              </Pressable>
            </>
          ) : null}

          {section === 'emergency' ? (
            <>
              <Field
                label={t('profile.emergencyName')}
                value={draft.emergency_contact_name ?? ''}
                onChangeText={(v) => set('emergency_contact_name', v)}
              />
              <Field
                label={t('profile.emergencyPhone')}
                value={draft.emergency_contact_phone ?? ''}
                onChangeText={(v) => set('emergency_contact_phone', v)}
                keyboardType="phone-pad"
              />
              <Field
                label={t('profile.homeAddress')}
                value={draft.home_address ?? ''}
                onChangeText={(v) => set('home_address', v)}
                autoCapitalize="words"
              />
            </>
          ) : null}

          {section === 'security' ? (
            <>
              <Field
                label={t('profile.newPassword')}
                value={pw1}
                onChangeText={setPw1}
                secureTextEntry
                autoCapitalize="none"
              />
              <Field
                label={t('profile.confirmPassword')}
                value={pw2}
                onChangeText={setPw2}
                secureTextEntry
                autoCapitalize="none"
              />
              {pwMsg ? (
                <Text style={[styles.pwMsg, pwMsg.ok ? styles.pwOk : styles.pwErr]}>
                  {pwMsg.text}
                </Text>
              ) : null}
              <Pressable
                onPress={onChangePassword}
                style={styles.secondaryBtn}
                disabled={busy}
              >
                {busy ? (
                  <Spinner size={20} color={INK} />
                ) : (
                  <Text style={styles.secondaryBtnText}>
                    {t('profile.changePassword')}
                  </Text>
                )}
              </Pressable>
            </>
          ) : null}

          {section === 'language' ? (
            <>
              <FieldLabel>{t('profile.language')}</FieldLabel>
              <View style={styles.chipRow}>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <Chip
                    key={l.code}
                    label={`${l.flag}  ${l.label}`}
                    active={i18n.language === l.code}
                    onPress={() => onLanguage(l.code)}
                  />
                ))}
              </View>
            </>
          ) : null}
        </View>

        {showSave ? (
          <Pressable
            onPress={onSave}
            disabled={busy || savedFlash}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || savedFlash) && { opacity: 0.8 },
            ]}
          >
            {busy ? (
              <Spinner size={22} color="#ffffff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {savedFlash ? `✓  ${t('profile.saved')}` : t('profile.save')}
              </Text>
            )}
          </Pressable>
        ) : null}

        {section === 'security' ? (
          <Pressable onPress={onDelete} style={styles.deleteBtn} disabled={busy}>
            <Text style={styles.deleteText}>{t('profile.deleteAccount')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Field({
  label,
  flex,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; flex?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={flex ? { flex: 1 } : undefined}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        placeholderTextColor="#AEBBB3"
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
    gap: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4EAE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F800,
    fontSize: 17,
    color: INK,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EDE9',
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },

  fieldLabel: {
    fontFamily: F700,
    fontSize: 12.5,
    color: MUTED,
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#F4F7F5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F4F7F5',
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontFamily: F600,
    fontSize: 15.5,
    color: INK,
  },
  inputFocused: {
    backgroundColor: '#FFFFFF',
    borderColor: GREEN,
  },
  row2: { flexDirection: 'row', gap: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#F1F5F2',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#E8F5EE',
    borderColor: GREEN,
  },
  chipText: { fontFamily: F700, fontSize: 13.5, color: '#6B7280' },
  chipTextActive: { color: '#067647' },

  pwMsg: { fontFamily: F600, fontSize: 13 },
  pwOk: { color: '#0FA968' },
  pwErr: { color: '#D64545' },

  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F4F7F5',
    borderRadius: 16,
    padding: 13,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#EFEDFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkTitle: { fontFamily: F800, fontSize: 13.5, color: INK },
  linkSub: { fontFamily: F600, fontSize: 11.5, color: MUTED, marginTop: 2 },
  linkArrow: { fontSize: 22, fontFamily: F700, color: '#B8C4BE' },

  primaryBtn: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryBtnText: { fontFamily: F800, fontSize: 15.5, color: '#FFFFFF' },

  secondaryBtn: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: F700, fontSize: 14.5, color: INK },

  deleteBtn: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
  deleteText: { fontFamily: F800, fontSize: 14.5, color: '#D64545' },
});
