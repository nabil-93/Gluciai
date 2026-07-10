import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/ui';
import { isRTL } from '@/i18n';
import { saveProfile } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import type { DiabetesType, InsulinType, Profile } from '@/types';

const N500 = 'Nunito_500Medium';
const N600 = 'Nunito_600SemiBold';
const N700 = 'Nunito_700Bold';
const N800 = 'Nunito_800ExtraBold';

const GREEN = '#1fbc78';

const STEPS = [
  'personal',
  'diabetes',
  'insulin',
  'carbRatio',
  'correction',
  'target',
  'emergency',
  'doctor',
  'finish',
] as const;

/* Step hero illustrations from the design bundle */
const HEROES: Record<(typeof STEPS)[number], any> = {
  personal: require('../assets/nfss/il_s1.png'),
  diabetes: require('../assets/nfss/il_s2.png'),
  insulin: require('../assets/nfss/il_s3.png'),
  carbRatio: require('../assets/nfss/il_s3.png'),
  correction: require('../assets/nfss/il_s6.png'),
  target: require('../assets/nfss/il_s6.png'),
  emergency: require('../assets/nfss/il_s7.png'),
  doctor: require('../assets/nfss/il_s8.png'),
  finish: require('../assets/nfss/il_s9.png'),
};

/* ── Small green icons for input fields ── */
function IconTile({ children }: { children: React.ReactNode }) {
  return <View style={styles.iconTile}>{children}</View>;
}
function RulerIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={3} y={8} width={18} height={8} rx={2} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M8 8v3M12 8v4M16 8v3" stroke={GREEN} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ScaleIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={16} height={16} rx={4} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M12 8l2 4h-4l2-4z" fill={GREEN} />
    </Svg>
  );
}
function DownIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M12 5v13M6 13l6 6 6-6" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function UpIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M12 19V6M6 11l6-6 6 6" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function PersonIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={GREEN} strokeWidth={2} fill="none" />
      <Path d="M4 20c0-4 3.5-6 8-6s8 2 8 6" stroke={GREEN} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}
function PhoneIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"
        stroke={GREEN}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
function ShieldCheck({ color = '#1f9c6a', size = 24 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function ShieldInfo({ color = '#1f9c6a', size = 30 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M12 8v5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={12} cy={16} r={1} fill={color} />
    </Svg>
  );
}

/* ── Reusable field (white card + icon tile + input) ── */
function Field({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  unit,
  autoCapitalize,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'numeric' | 'phone-pad' | 'default';
  unit?: string;
  autoCapitalize?: 'words' | 'none';
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <IconTile>{icon}</IconTile>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98a1af"
          keyboardType={keyboardType === 'default' ? undefined : keyboardType}
          autoCapitalize={autoCapitalize ?? 'none'}
          style={styles.fieldInput}
        />
        {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/* ── Info box (green or gray) ── */
function InfoBox({
  tone = 'green',
  title,
  text,
}: {
  tone?: 'green' | 'gray';
  title?: string;
  text: string;
}) {
  return (
    <View
      style={[
        styles.infoBox,
        { backgroundColor: tone === 'green' ? '#e9f6ef' : '#eef1f4' },
      ]}
    >
      {title ? <ShieldInfo /> : <ShieldCheck size={24} />}
      <View style={{ flex: 1 }}>
        {title ? <Text style={styles.infoTitle}>{title}</Text> : null}
        <Text style={styles.infoText}>{text}</Text>
      </View>
    </View>
  );
}

export default function WizardScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  // Scale the hero to the viewport so title + fields + CTA stay visible.
  const heroH = Math.min(150, Math.round(winH * 0.17));
  const setWizardDone = useAppStore((s) => s.setWizardDone);

  const [step, setStep] = useState(0);
  const [gender, setGender] = useState<'male' | 'female' | 'other'>();
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [diabetesType, setDiabetesType] = useState<DiabetesType>();
  const [insulinTypes, setInsulinTypes] = useState<InsulinType[]>([]);
  const [carbRatio, setCarbRatio] = useState('10');
  const [correction, setCorrection] = useState('50');
  const [targetLow, setTargetLow] = useState('70');
  const [targetHigh, setTargetHigh] = useState('180');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [saving, setSaving] = useState(false);

  const key = STEPS[step];
  const usesInsulin = insulinTypes.length > 0;

  const canContinue = useMemo(() => {
    switch (key) {
      case 'diabetes':
        return !!diabetesType;
      case 'target':
        return Number(targetLow) > 0 && Number(targetHigh) > Number(targetLow);
      default:
        return true;
    }
  }, [key, diabetesType, targetLow, targetHigh]);

  const toggleInsulin = (type: InsulinType) => {
    setInsulinTypes((prev) =>
      prev.includes(type) ? prev.filter((x) => x !== type) : [...prev, type]
    );
  };

  const next = async () => {
    // Skip insulin-dose steps for users without insulin
    if (key === 'insulin' && !usesInsulin) {
      setStep(STEPS.indexOf('target'));
      return;
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    // Finish
    setSaving(true);
    const profile: Profile = {
      user_id: 'demo-user',
      name: '',
      gender,
      height: Number(height) || undefined,
      weight: Number(weight) || undefined,
      diabetes_type: diabetesType ?? 'type2',
      insulin_types: insulinTypes,
      language: i18n.language,
      target_low: Number(targetLow) || 70,
      target_high: Number(targetHigh) || 180,
      carb_ratio: usesInsulin ? Number(carbRatio) || undefined : undefined,
      correction_factor: usesInsulin ? Number(correction) || undefined : undefined,
      emergency_contact_name: contactName || undefined,
      emergency_contact_phone: contactPhone || undefined,
      doctor_name: doctorName || undefined,
    };
    try {
      await saveProfile(profile);
    } finally {
      setSaving(false);
      setWizardDone();
      router.replace('/(tabs)');
    }
  };

  const back = () => {
    if (step === 0) {
      router.replace('/auth');
      return;
    }
    // Mirror the skip logic when going back from target without insulin
    if (key === 'target' && !usesInsulin) {
      setStep(STEPS.indexOf('insulin'));
      return;
    }
    setStep(step - 1);
  };

  /* Titles & subtitles per step, from i18n */
  const TITLES: Record<(typeof STEPS)[number], { title: string; sub?: string }> = {
    personal: { title: t('wizard.personalTitle'), sub: t('wizard.personalSub') },
    diabetes: { title: t('wizard.diabetesTitle') },
    insulin: { title: t('wizard.insulinTitle'), sub: t('wizard.insulinSub') },
    carbRatio: { title: t('wizard.carbRatioTitle'), sub: t('wizard.carbRatioSub') },
    correction: { title: t('wizard.correctionTitle'), sub: t('wizard.correctionSub') },
    target: { title: t('wizard.targetTitle'), sub: t('wizard.targetSub') },
    emergency: { title: t('wizard.emergencyTitle'), sub: t('wizard.emergencySub') },
    doctor: { title: t('wizard.doctorTitle'), sub: t('wizard.doctorSub') },
    finish: { title: t('wizard.finishTitle'), sub: t('wizard.finishDesc') },
  };

  const GENDERS = [
    { v: 'male' as const, label: t('wizard.male'), icon: '♂', bg: '#2ec97e' },
    { v: 'female' as const, label: t('wizard.female'), icon: '♀', bg: '#8b5cf6' },
    { v: 'other' as const, label: t('wizard.other'), icon: '⚇', bg: '#f0902f' },
  ];

  const DIABETES: { v: DiabetesType; icon: string }[] = [
    { v: 'type1', icon: '🩸' },
    { v: 'type2', icon: '🍎' },
    { v: 'gestational', icon: '🤰' },
    { v: 'prediabetes', icon: '⚠️' },
  ];

  const INSULINS: { v: InsulinType | 'none'; icon: string; label: string }[] = [
    { v: 'rapid', icon: '⚡', label: t('wizard.rapid') },
    { v: 'long', icon: '⏱️', label: t('wizard.long') },
    { v: 'mixed', icon: '💉', label: t('wizard.mixed') },
    { v: 'none', icon: '🚫', label: t('wizard.noInsulin') },
  ];

  const info = TITLES[key];
  const rtl = isRTL(i18n.language);

  return (
    <View style={styles.root}>
      {/* Header: back + progress + step count */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 26 }}>
        <View style={styles.progressRow}>
          <Pressable onPress={back} hitSlop={10}>
            <Svg
              width={26}
              height={26}
              viewBox="0 0 24 24"
              style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}
            >
              <Path
                d="M15 5l-7 7 7 7"
                stroke="#2b3442"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Pressable>
          <View style={styles.progressTrack}>
            <LinearGradient
              colors={['#2ec983', '#1fbc78']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.progressFill,
                { width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` },
              ]}
            />
          </View>
        </View>
        <Text style={styles.stepText}>
          {t('wizard.progress', { current: step + 1, total: STEPS.length })}
        </Text>
      </View>

      {/* Scrollable step content */}
      <ScrollView
        key={key}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 26, paddingBottom: 12 }}
        style={{ flex: 1, marginTop: 4 }}
      >
        <FadeInView distance={10} duration={400}>
          <View style={{ alignItems: 'center' }}>
            <Image
              source={HEROES[key]}
              style={[styles.hero, { height: heroH }]}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>{info.title}</Text>
          {info.sub ? <Text style={styles.subtitle}>{info.sub}</Text> : null}

          {/* ── PERSONAL ── */}
          {key === 'personal' ? (
            <>
              <View style={styles.genderRow}>
                {GENDERS.map((g) => {
                  const on = gender === g.v;
                  return (
                    <Pressable
                      key={g.v}
                      onPress={() => setGender(g.v)}
                      style={[styles.genderCard, on && styles.cardOn]}
                    >
                      {/* radio in the top-right corner */}
                      <View style={[styles.radioCorner, on && styles.radioOn]}>
                        {on ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={[styles.genderIcon, { backgroundColor: g.bg }]}>
                        <Text style={styles.genderIconText}>{g.icon}</Text>
                      </View>
                      <Text style={styles.genderLabel}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Field
                label={t('wizard.height')}
                icon={<RulerIcon />}
                value={height}
                onChangeText={setHeight}
                placeholder={t('wizard.heightPlaceholder')}
                keyboardType="numeric"
              />
              <Field
                label={t('wizard.weight')}
                icon={<ScaleIcon />}
                value={weight}
                onChangeText={setWeight}
                placeholder={t('wizard.weightPlaceholder')}
                keyboardType="numeric"
              />
              <InfoBox text={t('wizard.personalInfoNote')} />
            </>
          ) : null}

          {/* ── DIABETES (radio) ── */}
          {key === 'diabetes' ? (
            <View style={styles.optionsCol}>
              {DIABETES.map((o) => {
                const on = diabetesType === o.v;
                return (
                  <Pressable
                    key={o.v}
                    onPress={() => setDiabetesType(o.v)}
                    style={[styles.optionCard, on && styles.cardOn]}
                  >
                    <View style={styles.optionIcon}>
                      <Text style={{ fontSize: 20 }}>{o.icon}</Text>
                    </View>
                    <Text style={styles.optionLabel}>{t(`wizard.${o.v}`)}</Text>
                    <View style={[styles.radioLg, on && styles.radioOn]}>
                      {on ? <View style={styles.radioDotLg} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* ── INSULIN (multi) ── */}
          {key === 'insulin' ? (
            <View style={styles.optionsCol}>
              {INSULINS.map((o) => {
                const on =
                  o.v === 'none'
                    ? insulinTypes.length === 0
                    : insulinTypes.includes(o.v as InsulinType);
                return (
                  <Pressable
                    key={o.v}
                    onPress={() =>
                      o.v === 'none'
                        ? setInsulinTypes([])
                        : toggleInsulin(o.v as InsulinType)
                    }
                    style={[styles.optionCard, on && styles.cardOn]}
                  >
                    <View style={styles.optionIcon}>
                      <Text style={{ fontSize: 20 }}>{o.icon}</Text>
                    </View>
                    <Text style={styles.optionLabel}>{o.label}</Text>
                    <View style={[styles.radioLg, on && styles.radioOn]}>
                      {on ? <View style={styles.radioDotLg} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* ── CARB RATIO ── */}
          {key === 'carbRatio' ? (
            <>
              <Field
                label={t('wizard.carbRatioTitle')}
                icon={<ScaleIcon />}
                value={carbRatio}
                onChangeText={setCarbRatio}
                placeholder={t('wizard.carbRatioPlaceholder')}
                keyboardType="numeric"
                unit="g/U"
              />
              <InfoBox
                title={t('wizard.whyImportant')}
                text={t('wizard.carbRatioHint')}
              />
            </>
          ) : null}

          {/* ── CORRECTION ── */}
          {key === 'correction' ? (
            <>
              <Field
                label={t('wizard.correctionTitle')}
                icon={<DownIcon />}
                value={correction}
                onChangeText={setCorrection}
                placeholder={t('wizard.correctionPlaceholder')}
                keyboardType="numeric"
                unit="mg/dl"
              />
              <InfoBox
                title={t('wizard.whyImportant')}
                text={t('wizard.correctionHint')}
              />
            </>
          ) : null}

          {/* ── TARGET RANGE ── */}
          {key === 'target' ? (
            <>
              <Field
                label={t('wizard.targetLow')}
                icon={<DownIcon />}
                value={targetLow}
                onChangeText={setTargetLow}
                placeholder={t('wizard.targetLowPlaceholder')}
                keyboardType="numeric"
                unit="mg/dl"
              />
              <Field
                label={t('wizard.targetHigh')}
                icon={<UpIcon />}
                value={targetHigh}
                onChangeText={setTargetHigh}
                placeholder={t('wizard.targetHighPlaceholder')}
                keyboardType="numeric"
                unit="mg/dl"
              />
              <InfoBox
                title={t('wizard.whyImportant')}
                text={t('wizard.targetInfoNote')}
              />
            </>
          ) : null}

          {/* ── EMERGENCY CONTACT ── */}
          {key === 'emergency' ? (
            <>
              <Field
                label={t('wizard.contactName')}
                icon={<PersonIcon />}
                value={contactName}
                onChangeText={setContactName}
                placeholder={t('wizard.contactNamePlaceholder')}
                autoCapitalize="words"
              />
              <Field
                label={t('wizard.contactPhone')}
                icon={<PhoneIcon />}
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder={t('wizard.contactPhonePlaceholder')}
                keyboardType="phone-pad"
              />
              <InfoBox
                tone="gray"
                title={t('wizard.whyImportant')}
                text={t('wizard.emergencyInfoNote')}
              />
            </>
          ) : null}

          {/* ── DOCTOR ── */}
          {key === 'doctor' ? (
            <>
              <Field
                label={t('wizard.doctorName')}
                icon={<PersonIcon />}
                value={doctorName}
                onChangeText={setDoctorName}
                placeholder={t('wizard.doctorNamePlaceholder')}
                autoCapitalize="words"
              />
              <InfoBox
                tone="gray"
                title={t('wizard.doctorInfoTitle')}
                text={t('wizard.doctorInfoNote')}
              />
            </>
          ) : null}

          <View style={{ height: 8 }} />
        </FadeInView>
      </ScrollView>

      {/* Footer CTA */}
      <View
        style={{
          paddingHorizontal: 26,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8) + 2,
        }}
      >
        <Pressable onPress={next} disabled={!canContinue || saving}>
          <LinearGradient
            colors={['#2ec983', '#1fbc78']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, (!canContinue || saving) && { opacity: 0.5 }]}
          >
            <Text style={styles.ctaText}>
              {key === 'finish' ? t('wizard.openDashboard') : t('common.next')}
            </Text>
            <Svg
              width={24}
              height={24}
              viewBox="0 0 24 24"
              style={[
                styles.ctaArrow,
                rtl && { left: 26, right: undefined, transform: [{ scaleX: -1 }] },
              ]}
            >
              <Path
                d="M4 12h15M13 6l6 6-6 6"
                stroke="#fff"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </LinearGradient>
        </Pressable>
        <View style={styles.backWrap}>
          {step > 0 ? (
            <Pressable onPress={back} hitSlop={10}>
              <Text style={styles.backText}>{t('common.back')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fc' },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e6ec',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  stepText: {
    fontFamily: N600,
    fontSize: 13.5,
    color: '#8a93a3',
    textAlign: 'center',
    marginTop: 8,
  },
  stepNum: { fontFamily: N800, color: GREEN },

  hero: { width: '72%', maxWidth: 280, height: 140 },
  title: {
    fontFamily: N800,
    fontSize: 24,
    letterSpacing: -0.3,
    color: '#101a2b',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: N500,
    fontSize: 14.5,
    lineHeight: 20,
    color: '#7b8494',
    textAlign: 'center',
    maxWidth: 360,
    alignSelf: 'center',
    marginBottom: 6,
  },

  /* Gender cards — vertical so the label is never clipped */
  genderRow: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 4 },
  genderCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 8,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  cardOn: { borderColor: GREEN },
  radioCorner: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#cfd5de',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderIconText: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  genderLabel: {
    fontFamily: N700,
    fontSize: 13.5,
    color: '#2b3442',
    textAlign: 'center',
  },

  /* Radio option cards */
  optionsCol: { gap: 11, marginTop: 14 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 15,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ece8fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { flex: 1, fontFamily: N700, fontSize: 16, color: '#2b3442' },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cfd5de',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioLg: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#cfd5de',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: GREEN },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: GREEN },
  radioDotLg: { width: 13, height: 13, borderRadius: 7, backgroundColor: GREEN },

  /* Fields */
  fieldLabel: {
    fontFamily: N800,
    fontSize: 15.5,
    color: '#2b3442',
    marginBottom: 7,
    marginLeft: 2,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 54,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    paddingHorizontal: 10,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#e4f4ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldInput: {
    flex: 1,
    fontFamily: N600,
    fontSize: 15.5,
    color: '#101a2b',
    padding: 0,
  },
  fieldUnit: { fontFamily: N600, fontSize: 14, color: '#98a1af' },

  /* Info boxes */
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 14,
    alignItems: 'flex-start',
  },
  infoTitle: {
    fontFamily: N800,
    fontSize: 15,
    color: '#2b3442',
    marginBottom: 4,
  },
  infoText: {
    fontFamily: N600,
    fontSize: 13.5,
    lineHeight: 19,
    color: '#4a5766',
  },

  /* CTA */
  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1fbc78',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 8,
  },
  ctaText: { fontFamily: N700, fontSize: 17, color: '#ffffff' },
  ctaArrow: { position: 'absolute', right: 22 },
  backWrap: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  backText: { fontFamily: N700, fontSize: 14.5, color: '#7b8494' },
});
