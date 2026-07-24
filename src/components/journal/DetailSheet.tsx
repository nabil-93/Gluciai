import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import type { DayEvent } from '@/services/dayLog';
import { activityKindLabel, logoFor } from './metricIcons';

/** Every entry the timeline shows — now including notes, status changes and
 *  settings changes, so nothing the patient did is hidden. */
export type VisibleEvent = DayEvent;

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';
const INK = '#1E2430';
const MUTED = '#8A93A0';
const LINE = '#F0F1F4';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Bottom-sheet detail for one journal entry. Meals reopen the full analysis
 * report; glucose / insulin / activity / measure entries can be deleted here
 * (with a confirm handled by the parent). Read-only rows otherwise — editing a
 * value happens on its own dedicated screen.
 */
export function DetailSheet({
  event,
  onClose,
  onDelete,
  onViewMeal,
}: {
  event: VisibleEvent | null;
  onClose: () => void;
  onDelete: (e: VisibleEvent) => void;
  onViewMeal: (e: Extract<DayEvent, { kind: 'meal' }>) => void;
}) {
  const { t, i18n } = useTranslation();
  if (!event) return null;

  const m = logoFor(event);
  const time = new Date(event.created_at).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const date = new Date(event.created_at).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let title = '';
  let big: React.ReactNode = null;
  const rows: { label: string; value: string }[] = [];
  let thumb: string | null = null;

  if (event.kind === 'meal') {
    const r = event.meal.result;
    title = t('journalV2.detailMeal');
    big = (
      <Text style={[styles.bigVal, { color: m.color }]}>
        {Math.round(r.carbohydrates)}
        <Text style={styles.bigUnit}> g</Text>{' '}
        <Text style={[styles.bigTag, { color: m.color }]}>{t('journalV2.mCarbs')}</Text>
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    if (event.meal.meal_type)
      rows.push({ label: t('journalV2.detailMeal'), value: t(`mealType.${event.meal.meal_type}`) });
    rows.push({ label: 'kcal', value: `${Math.round(r.calories)}` });
    const foods = (r.items ?? []).map((it) => it.name).slice(0, 4).join(', ') || r.food_name;
    if (foods) rows.push({ label: t('history.meal'), value: foods });
    if (event.meal.image_url && /^(https?|blob|data|file):/i.test(event.meal.image_url))
      thumb = event.meal.image_url;
  } else if (event.kind === 'insulin') {
    title = t('journalV2.mInsulin');
    big = (
      <Text style={[styles.bigVal, { color: m.color }]}>
        {event.insulin.dose}
        <Text style={styles.bigUnit}> U</Text>
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    rows.push({ label: t('journalV2.statDose'), value: t(`day.insu_${event.insulin.insulin_type}`) });
    if (event.insulin.notes) rows.push({ label: t('journalV2.detailNotes'), value: event.insulin.notes });
  } else if (event.kind === 'glucose') {
    title = t('journalV2.mGlucose');
    big = (
      <Text style={[styles.bigVal, { color: m.color }]}>
        {event.glucose.value}
        <Text style={styles.bigUnit}> mg/dL</Text>
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    if (event.glucose.notes) rows.push({ label: t('journalV2.detailNotes'), value: event.glucose.notes });
  } else if (event.kind === 'activity') {
    title = t('journalV2.mActivity');
    big = (
      <Text style={[styles.bigVal, { color: m.color }]}>
        {event.activity.duration_min}
        <Text style={styles.bigUnit}> min</Text>
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    rows.push({ label: t('journalV2.mActivity'), value: activityKindLabel(t, event.activity.kind) });
  } else if (event.kind === 'measure') {
    title = t(`journalV2.measure_${event.measure.kind}`, t('day.measures'));
    big = (
      <Text style={[styles.bigVal, { color: m.textColor }]}>
        {event.measure.value}
        <Text style={styles.bigUnit}> {event.measure.unit}</Text>
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
  } else if (event.event.kind === 'note') {
    title = t('journalV2.note');
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    rows.push({ label: t('journalV2.note'), value: String(event.event.payload.text ?? '') });
  } else if (event.event.kind === 'status') {
    title = t('journalV2.statusChanged');
    const from = event.event.payload.from;
    const to = event.event.payload.to;
    big = (
      <Text style={[styles.bigVal, styles.bigSmall, { color: m.textColor }]}>
        {t(`events.st_${from}`, String(from))} → {t(`events.st_${to}`, String(to))}
      </Text>
    );
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
  } else {
    // profile / settings change — list what moved
    title = t('journalV2.settingsChanged');
    rows.push({ label: t('journalV2.detailHour'), value: time });
    rows.push({ label: t('journalV2.detailDate'), value: date });
    const changes = event.event.payload.changes ?? {};
    for (const [field, v] of Object.entries(changes) as [string, { from?: unknown; to?: unknown }][]) {
      const fmt = (x: unknown) => (Array.isArray(x) ? x.join(' + ') : x == null ? '—' : String(x));
      rows.push({ label: t(`events.f_${field}`, field), value: `${fmt(v?.from)} → ${fmt(v?.to)}` });
    }
  }

  // Audit entries (status / settings changes) are read-only history — only
  // real data entries and notes can be removed.
  const deletable =
    event.kind !== 'event' || event.event.kind === 'note';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: m.tint }]}>
              <m.Icon size={20} color={m.color} />
            </View>
            <Text style={styles.title}>{title}</Text>
            {thumb ? <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" /> : null}
          </View>

          {big ? <View style={styles.bigRow}>{big}</View> : null}

          <View style={styles.rows}>
            {rows.map((r, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <Row label={r.label} value={r.value} />
              </React.Fragment>
            ))}
          </View>

          <View style={styles.actions}>
            {event.kind === 'meal' ? (
              <Pressable
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => onViewMeal(event)}
                accessibilityRole="button"
              >
                <Text style={styles.btnPrimaryText}>{t('journalV2.viewMeal')}</Text>
              </Pressable>
            ) : null}
            {deletable ? (
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() => onDelete(event)}
                accessibilityRole="button"
              >
                <Text style={styles.btnDangerText}>{t('journalV2.delete')}</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose} accessibilityRole="button">
                <Text style={styles.btnGhostText}>{t('common.close')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(16,24,20,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 34,
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E0E3E9',
    alignSelf: 'center',
    marginBottom: 16,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: F800, fontSize: 20, color: INK },
  thumb: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#F1F2F5' },

  bigRow: { marginTop: 16, marginBottom: 4 },
  bigVal: { fontFamily: F800, fontSize: 40, letterSpacing: -1 },
  bigSmall: { fontSize: 22, letterSpacing: -0.4 },
  bigUnit: { fontFamily: F700, fontSize: 17, color: MUTED },
  bigTag: { fontFamily: F800, fontSize: 15 },

  rows: { marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 16 },
  rowLabel: { fontFamily: F600, fontSize: 13.5, color: MUTED },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: F700, fontSize: 13.5, color: INK },
  sep: { height: 1, backgroundColor: LINE },

  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: { flex: 1, borderRadius: 15, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5 },
  btnPrimary: { backgroundColor: '#EAF7EF', borderColor: '#CDEBD9' },
  btnPrimaryText: { fontFamily: F800, fontSize: 13.5, color: '#0F7A42' },
  btnDanger: { backgroundColor: '#FEF2F2', borderColor: '#F6BCBC' },
  btnDangerText: { fontFamily: F800, fontSize: 13.5, color: '#D92D20' },
  btnGhost: { backgroundColor: '#F1F2F5', borderColor: '#E4E7EC' },
  btnGhostText: { fontFamily: F800, fontSize: 13.5, color: '#475569' },
});
