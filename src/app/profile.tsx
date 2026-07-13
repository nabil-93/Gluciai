import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar, CloseGlyph } from '@/components/ui';
import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import {
  changePassword,
  deleteAccount,
  signOut,
  uploadAvatar,
} from '@/services/account';
import { saveProfile } from '@/services/data';
import { confirmAsync, notify } from '@/lib/confirm';
import { ALL_FEATURES, planStatus } from '@/services/features';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { DiabetesType, InsulinType, Profile } from '@/types';

const GENDERS: Profile['gender'][] = ['male', 'female', 'other'];
const DIABETES: DiabetesType[] = ['type1', 'type2', 'gestational', 'prediabetes'];
const INSULINS: InsulinType[] = ['rapid', 'long', 'mixed'];

/* ── Minimal line icons (SVG, not emoji) for the section headers ── */
function Icon({ name, color = '#19C37D' }: { name: string; color?: string }) {
  const p: Record<string, string> = {
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0',
    heart:
      'M12 20s-7-4.35-9.33-8.2C1.1 9.14 2.2 5.5 5.6 5.05 7.7 4.78 9.2 6 12 8.5c2.8-2.5 4.3-3.72 6.4-3.45 3.4.45 4.5 4.09 2.93 6.75C19 15.65 12 20 12 20Z',
    shield: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z',
    globe:
      'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-2.5 2-2.5 16 0 18m0-18c2.5 2 2.5 16 0 18M3.5 9h17M3.5 15h17',
    camera:
      'M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 3.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    star: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 17.8 6.8 19.2l1-5.9L3.5 9.2l5.9-.9L12 3Z',
  };
  const strokeW = name === 'shield' || name === 'heart' ? 1.7 : 1.8;
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d={p[name]}
        stroke={color}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const lockedFeatures = useAppStore((s) => s.lockedFeatures);

  const [draft, setDraft] = useState<Profile | null>(() => profile);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);
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
    set('avatar_url', asset.uri);
    const url = await uploadAvatar(asset.uri, asset.base64 ?? undefined);
    if (url) set('avatar_url', url);
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

  const onSignOut = async () => {
    const ok = await confirmAsync({
      title: t('profile.signOut'),
      message: t('profile.signOutConfirm'),
      confirmLabel: t('profile.signOut'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (!ok) return;
    await signOut();
    router.replace('/auth');
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
    if (r.ok) router.replace('/auth');
    else notify(t('profile.error'), r.error ?? '');
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <CloseGlyph size={15} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 20,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar with a soft green ring */}
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickAvatar}>
            <LinearGradient
              colors={['#2ee59d', '#19C37D']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                <Avatar name={draft.name} uri={draft.avatar_url} size={92} />
              </View>
            </LinearGradient>
            <View style={styles.avatarEdit}>
              <Icon name="camera" color="#ffffff" />
            </View>
          </Pressable>
          <Pressable onPress={pickAvatar} hitSlop={6}>
            <Text style={styles.changePhoto}>{t('profile.changePhoto')}</Text>
          </Pressable>
        </View>

        {/* Personal info */}
        <Section icon="user" title={t('profile.sectionPersonal')}>
          <Field
            label={t('profile.name')}
            value={draft.name ?? ''}
            onChangeText={(v) => set('name', v)}
            autoCapitalize="words"
          />
          <Field
            label={t('profile.birthDate')}
            value={draft.birth_date ?? ''}
            onChangeText={(v) => set('birth_date', v)}
            placeholder="1990-01-31"
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
        </Section>

        {/* Medical info */}
        <Section icon="heart" title={t('profile.sectionMedical')}>
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
          <Field
            label={t('profile.doctorName')}
            value={draft.doctor_name ?? ''}
            onChangeText={(v) => set('doctor_name', v)}
          />
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
        </Section>

        {/* Save */}
        <PrimaryButton
          label={savedFlash ? `✓  ${t('profile.saved')}` : t('profile.save')}
          onPress={onSave}
          loading={busy}
          disabled={savedFlash}
        />

        {/* Subscription → free-plan / support message */}
        <View style={{ marginTop: 22 }}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FFF6E0' }]}>
              <Icon name="star" color="#E8930C" />
            </View>
            <Text style={styles.sectionTitle}>{t('profile.sectionPlan')}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/subscription' as any)}
            style={styles.planCard}
          >
            <View style={styles.planIcon}>
              <Text style={{ fontSize: 20 }}>⭐</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.planTitle}>{t('profile.planRowTitle')}</Text>
              <Text style={styles.planSub} numberOfLines={2}>
                {(() => {
                  const status = planStatus(lockedFeatures);
                  const active =
                    ALL_FEATURES.length -
                    ALL_FEATURES.filter((f) => lockedFeatures.includes(f)).length;
                  if (status === 'full') return t('profile.planRowSubFull');
                  if (status === 'partial')
                    return t('profile.planRowSubPartial', {
                      active,
                      total: ALL_FEATURES.length,
                    });
                  return t('profile.planRowSubFree');
                })()}
              </Text>
            </View>
            <Text style={styles.planArrow}>›</Text>
          </Pressable>
        </View>

        {/* Security */}
        <Section icon="shield" title={t('profile.sectionSecurity')}>
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
          <SecondaryButton
            label={t('profile.changePassword')}
            onPress={onChangePassword}
          />
        </Section>

        {/* App: language + sign out */}
        <Section icon="globe" title={t('profile.sectionApp')}>
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
          <View style={{ height: 6 }} />
          <SecondaryButton label={t('profile.signOut')} onPress={onSignOut} />
        </Section>

        {/* Danger zone */}
        <Pressable onPress={onDelete} style={styles.deleteBtn} disabled={busy}>
          <Text style={styles.deleteText}>{t('profile.deleteAccount')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Icon name={icon} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

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
        placeholderTextColor={colors.textPlaceholder}
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

function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={{ marginTop: 24 }}
    >
      <LinearGradient
        colors={disabled ? ['#8fe0bf', '#8fe0bf'] : ['#2ee59d', '#19C37D']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryBtnText}>
          {loading ? '…' : label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryBtn}>
      <Text style={styles.secondaryBtnText}>{label}</Text>
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
    borderBottomColor: '#EEF0F5',
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  avatarWrap: { alignItems: 'center', gap: 12 },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  avatarInner: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEdit: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#19C37D',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhoto: { fontSize: 14.5, fontWeight: '700', color: '#19C37D' },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 11,
    marginLeft: 2,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#E9FBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    gap: 14,
    ...shadows.soft,
  },

  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 7,
  },
  input: {
    backgroundColor: '#F6F7FB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F6F7FB',
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15.5,
    fontWeight: '600',
    color: colors.text,
  },
  inputFocused: {
    backgroundColor: '#ffffff',
    borderColor: '#19C37D',
  },
  row2: { flexDirection: 'row', gap: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#F3F0FF',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: '#E9FBF2',
    borderColor: '#19C37D',
  },
  chipText: { fontSize: 13.5, fontWeight: '700', color: '#6B7280' },
  chipTextActive: { color: '#14A96B' },

  pwMsg: { fontSize: 13, fontWeight: '600' },
  pwOk: { color: colors.primary },
  pwErr: { color: colors.danger },

  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#FCE8B8',
    ...shadows.soft,
  },
  planIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#FFF6E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  planSub: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  planArrow: { fontSize: 24, fontWeight: '700', color: '#C9A24B' },

  primaryBtn: {
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#19C37D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },

  secondaryBtn: {
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F3F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '750' as any, color: colors.text },

  deleteBtn: { marginTop: 28, alignItems: 'center', paddingVertical: 14 },
  deleteText: { fontSize: 15, fontWeight: '800', color: colors.danger },
});
