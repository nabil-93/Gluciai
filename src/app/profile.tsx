import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  AppButton,
  Avatar,
  BevelCard,
  CloseGlyph,
  InputField,
} from '@/components/ui';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import {
  changePassword,
  deleteAccount,
  signOut,
  uploadAvatar,
} from '@/services/account';
import { saveProfile } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type {
  DiabetesType,
  InsulinType,
  Profile,
} from '@/types';

const GENDERS: Profile['gender'][] = ['male', 'female', 'other'];
const DIABETES: DiabetesType[] = ['type1', 'type2', 'gestational', 'prediabetes'];
const INSULINS: InsulinType[] = ['rapid', 'long', 'mixed'];

export default function ProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);

  // Editable working copy of the profile.
  const [draft, setDraft] = useState<Profile | null>(() => profile);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  // Password fields
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!profile || !draft) return <Redirect href="/(tabs)" />;

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

  /* ── Avatar ── */
  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    // Optimistic local preview, then upload in the background.
    set('avatar_url', asset.uri);
    const url = await uploadAvatar(asset.uri, asset.base64 ?? undefined);
    if (url) set('avatar_url', url);
  };

  /* ── Save profile ── */
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

  /* ── Change password ── */
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

  /* ── Language ── */
  const onLanguage = async (code: LanguageCode) => {
    await setAppLanguage(code);
    set('language', code);
    await saveProfile({ ...draft, language: code });
  };

  /* ── Sign out ── */
  const onSignOut = () => {
    Alert.alert(t('profile.signOut'), t('profile.signOutConfirm'), [
      { text: t('profile.cancel'), style: 'cancel' },
      {
        text: t('profile.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  };

  /* ── Delete account ── */
  const onDelete = () => {
    Alert.alert(
      t('profile.deleteConfirmTitle'),
      t('profile.deleteConfirmBody'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteAccount'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const r = await deleteAccount();
            setBusy(false);
            if (r.ok) router.replace('/auth');
            else Alert.alert(t('profile.error'), r.error ?? '');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <CloseGlyph size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickAvatar}>
            <Avatar name={draft.name} uri={draft.avatar_url} size={96} />
            <View style={styles.avatarEdit}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </View>
          </Pressable>
          <Pressable onPress={pickAvatar}>
            <Text style={styles.changePhoto}>{t('profile.changePhoto')}</Text>
          </Pressable>
        </View>

        {/* Personal info */}
        <Section title={t('profile.sectionPersonal')}>
          <InputField
            label={t('profile.name')}
            value={draft.name ?? ''}
            onChangeText={(v) => set('name', v)}
            autoCapitalize="words"
          />
          <InputField
            label={t('profile.birthDate')}
            value={draft.birth_date ?? ''}
            onChangeText={(v) => set('birth_date', v)}
            placeholder="1990-01-31"
          />
          <Text style={styles.fieldLabel}>{t('profile.gender')}</Text>
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
            <View style={{ flex: 1 }}>
              <InputField
                label={t('profile.height')}
                value={draft.height != null ? String(draft.height) : ''}
                onChangeText={(v) => setNum('height', v)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label={t('profile.weight')}
                value={draft.weight != null ? String(draft.weight) : ''}
                onChangeText={(v) => setNum('weight', v)}
                keyboardType="numeric"
              />
            </View>
          </View>
        </Section>

        {/* Medical info */}
        <Section title={t('profile.sectionMedical')}>
          <Text style={styles.fieldLabel}>{t('profile.diabetesType')}</Text>
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
          <Text style={styles.fieldLabel}>{t('profile.insulinTypes')}</Text>
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
            <View style={{ flex: 1 }}>
              <InputField
                label={t('profile.targetLow')}
                value={String(draft.target_low ?? '')}
                onChangeText={(v) => setNum('target_low', v)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
                label={t('profile.targetHigh')}
                value={String(draft.target_high ?? '')}
                onChangeText={(v) => setNum('target_high', v)}
                keyboardType="numeric"
              />
            </View>
          </View>
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <InputField
                label={t('profile.carbRatio')}
                value={draft.carb_ratio != null ? String(draft.carb_ratio) : ''}
                onChangeText={(v) => setNum('carb_ratio', v)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <InputField
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
          </View>
          <InputField
            label={t('profile.doctorName')}
            value={draft.doctor_name ?? ''}
            onChangeText={(v) => set('doctor_name', v)}
          />
          <InputField
            label={t('profile.emergencyName')}
            value={draft.emergency_contact_name ?? ''}
            onChangeText={(v) => set('emergency_contact_name', v)}
          />
          <InputField
            label={t('profile.emergencyPhone')}
            value={draft.emergency_contact_phone ?? ''}
            onChangeText={(v) => set('emergency_contact_phone', v)}
            keyboardType="phone-pad"
          />
        </Section>

        {/* Save */}
        <AppButton
          label={savedFlash ? t('profile.saved') : t('profile.save')}
          onPress={onSave}
          loading={busy}
          disabled={savedFlash}
        />

        {/* Security */}
        <Section title={t('profile.sectionSecurity')}>
          <InputField
            label={t('profile.newPassword')}
            value={pw1}
            onChangeText={setPw1}
            secureTextEntry
            autoCapitalize="none"
          />
          <InputField
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
          <AppButton
            label={t('profile.changePassword')}
            onPress={onChangePassword}
            variant="secondary"
          />
        </Section>

        {/* App: language + sign out */}
        <Section title={t('profile.sectionApp')}>
          <Text style={styles.fieldLabel}>{t('profile.language')}</Text>
          <View style={styles.chipRow}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <Chip
                key={l.code}
                label={`${l.flag} ${l.label}`}
                active={i18n.language === l.code}
                onPress={() => onLanguage(l.code)}
              />
            ))}
          </View>
          <View style={{ height: 8 }} />
          <AppButton
            label={t('profile.signOut')}
            onPress={onSignOut}
            variant="secondary"
          />
        </Section>

        {/* Danger zone */}
        <Pressable onPress={onDelete} style={styles.deleteBtn} disabled={busy}>
          <Text style={styles.deleteText}>{t('profile.deleteAccount')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <BevelCard style={{ gap: 12 }}>{children}</BevelCard>
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
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  avatarWrap: { alignItems: 'center', gap: 8, marginTop: 8 },
  avatarEdit: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  avatarEditIcon: { fontSize: 15 },
  changePhoto: { fontSize: 14, fontWeight: '700', color: colors.ai },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
    marginLeft: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  row2: { flexDirection: 'row', gap: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: '#fff' },

  pwMsg: { fontSize: 13, fontWeight: '600' },
  pwOk: { color: colors.primary },
  pwErr: { color: colors.danger },

  deleteBtn: {
    marginTop: 26,
    alignItems: 'center',
    paddingVertical: 14,
  },
  deleteText: { fontSize: 15, fontWeight: '800', color: colors.danger },
});
