import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { ActionGlyph, FadeInView, HeroScreen, HERO_INK, HERO_MUTED, Spinner } from '@/components/ui';
import { nowMs } from '@/lib/clock';
import { parseDecimal, sanitizeDecimal } from '@/lib/num';
import { saveGlucose } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Colour + label for the entered value against the patient's target range. */
function zone(v: number, low: number, high: number) {
  if (!v) return { color: '#9CA3AF', bg: '#F3F4F6', key: '' };
  if (v < low) return { color: '#FF7A1A', bg: '#FFF1E6', key: 'low' };
  if (v <= high) return { color: '#19C37D', bg: '#E9FBF2', key: 'inRange' };
  if (v <= high * 1.4) return { color: '#F2B84B', bg: '#FEF6E7', key: 'high' };
  return { color: '#FF3B30', bg: '#FEECEC', key: 'high' };
}

/** The readings a patient reaches for most, so most entries are two taps. */
const QUICK = [70, 90, 110, 140, 180, 250];

export default function LogGlucoseScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const profile = useAppStore((s) => s.profile);
  const glucoseLogs = useAppStore((s) => s.glucoseLogs);
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const num = parseDecimal(value) ?? 0;
  const z = zone(num, low, high);

  /** The previous reading, so the new one has something to mean. */
  const last = glucoseLogs[0];
  const delta = last && num ? Math.round(num - last.value) : null;

  const lastLabel = useMemo(() => {
    if (!last) return null;
    const mins = Math.round((nowMs() - new Date(last.created_at).getTime()) / 60000);
    if (mins < 60) return t('log.minutesAgo', { n: Math.max(1, mins) });
    const h = Math.round(mins / 60);
    return h < 24 ? t('log.hoursAgo', { n: h }) : t('log.daysAgo', { n: Math.round(h / 24) });
  }, [last, t]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const save = async () => {
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await saveGlucose(num, notes || undefined);
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <HeroScreen
      title={t('log.glucoseTitle')}
      photo={require('../assets/glucose/hero-bg.png')}
      onClose={close}
      avoidKeyboard
      height={230}
    >
      {/* ── The number ── */}
      <FadeInView>
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.chip, { backgroundColor: z.bg }]}>
              <ActionGlyph name="glucose" color={z.color} size={22} knockout={z.bg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.cardLabel}>{t('log.glucoseValue')}</Text>
              <Text style={styles.cardRange}>
                {t('log.targetRange', { low, high })}
              </Text>
            </View>
          </View>

          <View style={styles.valueRow}>
            <TextInput
              value={value}
              onChangeText={(v) => setValue(sanitizeDecimal(v))}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor="#D6DEDA"
              autoFocus
              style={[styles.valueInput, { color: num ? z.color : HERO_INK }]}
            />
            <Text style={styles.unit}>mg/dL</Text>
          </View>

          {/* The band the value falls in, drawn as the band — not as a word
              on its own. Where you are matters more than the label. */}
          <View style={styles.scale}>
            <View style={[styles.scaleSeg, { backgroundColor: '#FFE2CC' }]} />
            <View style={[styles.scaleSeg, styles.scaleMid, { backgroundColor: '#C9F2DF' }]} />
            <View style={[styles.scaleSeg, { backgroundColor: '#FBE4C4' }]} />
            {num > 0 ? (
              <View
                style={[
                  styles.scaleMark,
                  { left: `${markPct(num, low, high)}%`, backgroundColor: z.color },
                ]}
              />
            ) : null}
          </View>

          {num > 0 ? (
            <View style={styles.statusRow}>
              <View style={[styles.zonePill, { backgroundColor: z.bg }]}>
                <View style={[styles.zoneDot, { backgroundColor: z.color }]} />
                <Text style={[styles.zoneText, { color: z.color }]}>
                  {t(`glucosePage.${z.key}`)}
                </Text>
              </View>
              {delta != null ? (
                <Text style={styles.delta}>
                  {delta > 0 ? '↑' : delta < 0 ? '↓' : '='} {Math.abs(delta)} {t('log.sinceLast')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </FadeInView>

      {/* ── Two taps instead of a keyboard ── */}
      <FadeInView delay={70}>
        <Text style={styles.sectionLabel}>{t('log.quickPick')}</Text>
        <View style={styles.quickRow}>
          {QUICK.map((q) => {
            const qz = zone(q, low, high);
            const on = num === q;
            return (
              <Pressable
                key={q}
                onPress={() => setValue(String(q))}
                style={[
                  styles.quickChip,
                  on && { backgroundColor: qz.bg, borderColor: qz.color },
                ]}
              >
                <Text style={[styles.quickText, on && { color: qz.color }]}>{q}</Text>
              </Pressable>
            );
          })}
        </View>
      </FadeInView>

      {/* ── Context ── */}
      <FadeInView delay={140}>
        <Text style={styles.sectionLabel}>{t('log.notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('log.notesHint')}
          placeholderTextColor="#AFBAB3"
          style={styles.notesInput}
        />
        {last && lastLabel ? (
          <Text style={styles.lastLine}>
            {t('log.lastReading', { value: last.value, when: lastLabel })}
          </Text>
        ) : null}
      </FadeInView>

      {/* ── Save ── */}
      <FadeInView delay={200}>
        <Pressable onPress={save} disabled={!num || saving} style={{ marginTop: 22 }}>
          <LinearGradient
            colors={!num ? ['#CFE7DC', '#CFE7DC'] : ['#2FC178', '#149A57']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.saveBtn}
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

/** Where the value sits on the low / in-range / high strip, 0–100 %. */
function markPct(v: number, low: number, high: number): number {
  const min = Math.max(20, low - 50);
  const max = high + 120;
  return Math.min(97, Math.max(1, ((v - min) / (max - min)) * 100));
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
  cardRange: { fontFamily: F500, fontSize: 11.5, color: HERO_MUTED, marginTop: 1 },

  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 },
  valueInput: {
    fontFamily: F800,
    fontSize: 58,
    letterSpacing: -2,
    padding: 0,
    minWidth: 100,
    lineHeight: 64,
  },
  unit: { fontFamily: F700, fontSize: 17, color: '#9AA8A0', marginBottom: 12 },

  scale: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
    marginTop: 6,
  },
  scaleSeg: { flex: 1, height: 8 },
  scaleMid: { flex: 2 },
  scaleMark: {
    position: 'absolute',
    top: -3,
    width: 5,
    height: 14,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginLeft: -2.5,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 16,
  },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneText: { fontFamily: F700, fontSize: 12.5 },
  delta: { fontFamily: F700, fontSize: 12, color: HERO_MUTED },

  sectionLabel: {
    fontFamily: F700,
    fontSize: 12,
    color: HERO_MUTED,
    marginTop: 22,
    marginBottom: 9,
    marginLeft: 2,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    minWidth: 62,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickText: { fontFamily: F800, fontSize: 15, color: HERO_INK },

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
  lastLine: {
    fontFamily: F500,
    fontSize: 11.5,
    color: HERO_MUTED,
    marginTop: 10,
    marginLeft: 2,
  },

  saveBtn: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#149A57',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  saveBtnText: { fontFamily: F800, fontSize: 16.5, color: '#ffffff' },
  cancelBtn: { alignItems: 'center', paddingVertical: 15, marginTop: 2 },
  cancelText: { fontFamily: F700, fontSize: 15, color: HERO_MUTED },
});
