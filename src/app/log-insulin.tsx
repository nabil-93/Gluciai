import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { ActionGlyph, FadeInView, HeroScreen, HERO_INK, HERO_MUTED, Spinner } from '@/components/ui';
import { guessMealTime } from '@/services/bolusEngine';
import { saveInsulin } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { InsulinType, MealType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const TYPES: { key: InsulinType; color: string; bg: string }[] = [
  { key: 'rapid', color: '#3B82F6', bg: '#EAF2FE' },
  { key: 'long', color: '#6D5EF9', bg: '#EFEDFE' },
  { key: 'mixed', color: '#FF7A1A', bg: '#FFF1E6' },
];

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A pen doses in half units — so does this. */
const STEP = 0.5;

export default function LogInsulinScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const profile = useAppStore((s) => s.profile);
  const insulinLogs = useAppStore((s) => s.insulinLogs);

  const [dose, setDose] = useState('');
  const [type, setType] = useState<InsulinType>('rapid');
  const [meal, setMeal] = useState<MealType>(() => guessMealTime(new Date()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Accept a decimal dose typed with a comma OR a dot (e.g. "4,5" / "4.5"),
  // keeping at most one digit after the separator (0.1 U precision).
  const onDoseChange = (v: string) => {
    const cleaned = v.replace(',', '.').replace(/[^0-9.]/g, '');
    const [intPart, ...rest] = cleaned.split('.');
    setDose(rest.length ? `${intPart}.${rest.join('').slice(0, 1)}` : cleaned);
  };
  const num = parseFloat(dose);
  const active = TYPES.find((x) => x.key === type)!;

  /** Their own pen's name, when they have told us — it is what they hold. */
  const penName =
    type === 'rapid' ? profile?.bolus_insulin_name : type === 'long' ? profile?.basal_insulin_name : null;

  /** Today's total for this type, so the new dose has a running context. */
  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();
    return insulinLogs
      .filter((l) => l.insulin_type === type && new Date(l.created_at).toDateString() === today)
      .reduce((s, l) => s + l.dose, 0);
  }, [insulinLogs, type]);

  const step = (delta: number) => {
    const next = Math.max(0, Math.round(((Number.isFinite(num) ? num : 0) + delta) * 10) / 10);
    setDose(next === 0 ? '' : String(next));
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await saveInsulin(num, type, notes || undefined, undefined, meal);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeroScreen
      title={t('log.insulinTitle')}
      photo={require('../assets/insulin/hero-bg.jpg')}
      onClose={close}
      avoidKeyboard
      height={230}
    >
      {/* ── The dose ── */}
      <FadeInView>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.chip, { backgroundColor: active.bg }]}>
              <ActionGlyph name="insulin" color={active.color} size={22} knockout={active.bg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardLabel}>{t('log.insulinDose')}</Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {penName || t(`wizard.${type}`)}
              </Text>
            </View>
          </View>

          {/* Typed or stepped — a pen moves in halves, and so should the
              buttons either side of the number. */}
          <View style={styles.doseRow}>
            <Pressable
              onPress={() => step(-STEP)}
              disabled={!num}
              style={[styles.stepBtn, !num && styles.stepBtnOff]}
            >
              <Text style={styles.stepSign}>−</Text>
            </Pressable>

            <View style={styles.doseMid}>
              <TextInput
                value={dose}
                onChangeText={onDoseChange}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor="#D6DEDA"
                autoFocus
                style={[styles.doseInput, { color: num ? active.color : HERO_INK }]}
              />
              <Text style={styles.unit}>U</Text>
            </View>

            <Pressable onPress={() => step(STEP)} style={styles.stepBtn}>
              <Text style={styles.stepSign}>+</Text>
            </Pressable>
          </View>

          {todayTotal > 0 ? (
            <Text style={styles.todayLine}>
              {t('log.todayTotal', {
                total: Math.round(todayTotal * 10) / 10,
                type: t(`wizard.${type}`),
              })}
            </Text>
          ) : null}
        </View>
      </FadeInView>

      {/* ── Which insulin ── */}
      <FadeInView delay={70}>
        <Text style={styles.sectionLabel}>{t('profile.insulinTypes')}</Text>
        <View style={styles.typeRow}>
          {TYPES.map((it) => {
            const on = type === it.key;
            return (
              <Pressable
                key={it.key}
                onPress={() => setType(it.key)}
                style={[
                  styles.typeChip,
                  on && { backgroundColor: it.bg, borderColor: it.color },
                ]}
              >
                <View style={[styles.typeDot, { backgroundColor: on ? it.color : '#D5DED8' }]} />
                <Text style={[styles.typeText, on && { color: it.color }]} numberOfLines={2}>
                  {t(`wizard.${it.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FadeInView>

      {/* ── Which meal it covers ── */}
      <FadeInView delay={130}>
        <Text style={styles.sectionLabel}>{t('bolus.mealMoment')}</Text>
        <View style={styles.mealRow}>
          {MEALS.map((m) => {
            const on = meal === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMeal(m)}
                style={[styles.mealChip, on && styles.mealChipOn]}
              >
                <Text style={[styles.mealText, on && styles.mealTextOn]} numberOfLines={1}>
                  {t(`bolus.meal_${m}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FadeInView>

      {/* ── Context ── */}
      <FadeInView delay={180}>
        <Text style={styles.sectionLabel}>{t('log.notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('log.notesHintInsulin')}
          placeholderTextColor="#AFBAB3"
          style={styles.notesInput}
        />
      </FadeInView>

      {/* ── Save ── */}
      <FadeInView delay={230}>
        <Pressable onPress={save} disabled={!num || saving} style={{ marginTop: 22 }}>
          <LinearGradient
            colors={!num ? ['#D8DEEC', '#D8DEEC'] : [active.color, shade(active.color)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={[styles.saveBtn, !!num && { shadowColor: active.color }]}
          >
            {saving ? (
              <Spinner size={22} color="#ffffff" />
            ) : (
              <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            )}
          </LinearGradient>
        </Pressable>
        <Pressable onPress={close} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
      </FadeInView>
    </HeroScreen>
  );
}

/** A darker end for the button's gradient, from the type's own colour. */
function shade(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const d = (c: number) => Math.round(c * 0.72);
  return `rgb(${d((n >> 16) & 255)}, ${d((n >> 8) & 255)}, ${d(n & 255)})`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 20,
    ...shadows.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: { fontFamily: F700, fontSize: 13, color: HERO_INK },
  cardSub: { fontFamily: F500, fontSize: 11.5, color: HERO_MUTED, marginTop: 1 },

  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#F2F6F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.45 },
  stepSign: { fontFamily: F800, fontSize: 24, color: HERO_INK, marginTop: -2 },
  doseMid: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  doseInput: {
    fontFamily: F800,
    fontSize: 54,
    letterSpacing: -1.8,
    padding: 0,
    minWidth: 70,
    textAlign: 'center',
    lineHeight: 60,
  },
  unit: { fontFamily: F700, fontSize: 18, color: '#9AA8A0', marginBottom: 10 },
  todayLine: {
    fontFamily: F600,
    fontSize: 11.5,
    color: HERO_MUTED,
    marginTop: 14,
    textAlign: 'center',
  },

  sectionLabel: {
    fontFamily: F700,
    fontSize: 12,
    color: HERO_MUTED,
    marginTop: 22,
    marginBottom: 9,
    marginLeft: 2,
  },

  typeRow: { flexDirection: 'row', gap: 8 },
  /* Stacked, not a row: "Schnell wirkend" and "Misch-Insulin" have no
     chance beside a dot in a third of the screen. */
  typeChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 62,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
  },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeText: {
    fontFamily: F700,
    fontSize: 11.5,
    lineHeight: 14.5,
    color: HERO_MUTED,
    textAlign: 'center',
  },

  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealChipOn: { borderColor: '#19C37D', backgroundColor: '#E9FBF2' },
  mealText: { fontFamily: F700, fontSize: 12.5, color: HERO_MUTED },
  mealTextOn: { color: '#0F7A42' },

  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontFamily: F600,
    fontSize: 15,
    color: HERO_INK,
    ...shadows.card,
  },

  saveBtn: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveBtnText: { fontFamily: F800, fontSize: 16.5, color: '#ffffff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 15, marginTop: 2 },
  cancelText: { fontFamily: F700, fontSize: 15, color: HERO_MUTED },
});
