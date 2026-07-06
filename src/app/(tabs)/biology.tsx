import React, { useMemo, useState } from 'react';
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

import { BevelCard, ChevronRight, PlusGlyph } from '@/components/ui';
import { useTabBarScroll } from '@/components/ui/TabBarVisibility';
import { saveMeasure } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors, typography } from '@/theme';
import type { MeasureKind } from '@/types';

const KINDS: {
  key: MeasureKind;
  labelKey: string;
  unit: string;
  emoji: string;
  hintKey?: string;
}[] = [
  { key: 'weight', labelKey: 'biology.weight', unit: 'kg', emoji: '⚖️' },
  {
    key: 'hba1c',
    labelKey: 'biology.hba1c',
    unit: '%',
    emoji: '🩸',
    hintKey: 'biology.hba1cHint',
  },
  { key: 'bp_systolic', labelKey: 'biology.bpSystolic', unit: 'mmHg', emoji: '❤️' },
];

export default function BiologyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { onScroll } = useTabBarScroll();
  const { measureLogs, removeMeasureLog, profile } = useAppStore();
  const locale = i18n.language;

  const [openKind, setOpenKind] = useState<MeasureKind | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const byKind = useMemo(() => {
    const map = new Map<MeasureKind, typeof measureLogs>();
    for (const m of measureLogs) {
      map.set(m.kind, [...(map.get(m.kind) ?? []), m]);
    }
    return map;
  }, [measureLogs]);

  const add = async (kind: MeasureKind, unit: string) => {
    const v = Number(value.replace(',', '.'));
    if (!v || v <= 0) return;
    setSaving(true);
    try {
      await saveMeasure(kind, v, unit);
      setValue('');
      setOpenKind(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 16,
          paddingBottom: 150,
        }}
      >
        <Text style={styles.title}>{t('biology.title')}</Text>
        <Text style={styles.subtitle}>
          {profile?.doctor_name
            ? t('biology.subtitleWithDoctor', { doctor: profile.doctor_name })
            : t('biology.subtitle')}
        </Text>

        {/* Health platform integrations */}
        <BevelCard
          style={styles.integrationsCard}
          onPress={() => router.push('/integrations')}
        >
          <Text style={{ fontSize: 24 }}>⌚</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.integrationsTitle}>{t('biology.sensors')}</Text>
            <Text style={styles.integrationsSub}>{t('biology.sensorsSub')}</Text>
          </View>
          <ChevronRight />
        </BevelCard>

        {KINDS.map((k) => {
          const logs = byKind.get(k.key) ?? [];
          const latest = logs[0];
          const previous = logs[1];
          const delta =
            latest && previous
              ? Math.round((latest.value - previous.value) * 10) / 10
              : null;
          const isOpen = openKind === k.key;

          return (
            <BevelCard key={k.key} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={{ fontSize: 22 }}>{k.emoji}</Text>
                <Text style={styles.cardTitle}>{t(k.labelKey)}</Text>
                <Pressable
                  onPress={() => {
                    setOpenKind(isOpen ? null : k.key);
                    setValue('');
                  }}
                  style={styles.addBtn}
                  hitSlop={6}
                >
                  <PlusGlyph size={16} color="#fff" />
                </Pressable>
              </View>

              {/* Latest value */}
              {latest ? (
                <View style={styles.latestRow}>
                  <Text style={styles.latestValue}>
                    {latest.value.toLocaleString(locale)}
                  </Text>
                  <Text style={styles.latestUnit}>{k.unit}</Text>
                  {delta !== null ? (
                    <Text
                      style={[
                        styles.delta,
                        {
                          color:
                            delta > 0
                              ? colors.glucoseHigh
                              : delta < 0
                                ? colors.glucoseInRange
                                : colors.textSecondary,
                        },
                      ]}
                    >
                      {delta > 0 ? '+' : ''}
                      {delta}
                    </Text>
                  ) : null}
                  <Text style={styles.latestDate}>
                    {new Date(latest.created_at).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noData}>{t('biology.noData')}</Text>
              )}
              {k.hintKey ? <Text style={styles.hint}>{t(k.hintKey)}</Text> : null}

              {/* Inline add form */}
              {isOpen ? (
                <View style={styles.form}>
                  <TextInput
                    value={value}
                    onChangeText={setValue}
                    keyboardType="numeric"
                    placeholder={t('biology.valuePlaceholder', { unit: k.unit })}
                    placeholderTextColor={colors.textPlaceholder}
                    style={styles.input}
                    autoFocus
                  />
                  <Pressable
                    onPress={() => add(k.key, k.unit)}
                    disabled={saving || !Number(value.replace(',', '.'))}
                    style={[
                      styles.saveBtn,
                      (!Number(value.replace(',', '.')) || saving) && {
                        opacity: 0.4,
                      },
                    ]}
                  >
                    <Text style={styles.saveBtnText}>OK</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* History */}
              {logs.length > 1 ? (
                <View style={styles.history}>
                  {logs.slice(1, 4).map((m) => (
                    <View key={m.id} style={styles.historyRow}>
                      <Text style={styles.historyValue}>
                        {m.value.toLocaleString(locale)} {m.unit}
                      </Text>
                      <Text style={styles.historyDate}>
                        {new Date(m.created_at).toLocaleDateString(locale, {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </Text>
                      <Pressable
                        onPress={() => removeMeasureLog(m.id)}
                        hitSlop={8}
                      >
                        <Text style={styles.historyDelete}>✕</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              {latest ? (
                <Pressable
                  onPress={() => removeMeasureLog(latest.id)}
                  style={styles.deleteLatest}
                  hitSlop={6}
                >
                  <Text style={styles.deleteLatestText}>
                    {t('biology.deleteLatest')}
                  </Text>
                </Pressable>
              ) : null}
            </BevelCard>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  title: { ...typography.display, marginHorizontal: 2 },
  subtitle: {
    fontSize: 14.5,
    color: colors.textSecondary,
    marginHorizontal: 2,
    marginTop: 4,
    marginBottom: 18,
  },
  integrationsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  integrationsTitle: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  integrationsSub: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary },
  card: { marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  latestRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 12,
  },
  latestValue: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  latestUnit: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  delta: { fontSize: 15, fontWeight: '700' },
  latestDate: { marginLeft: 'auto', fontSize: 13, color: colors.textSecondary },
  noData: { marginTop: 12, fontSize: 15, color: colors.textPlaceholder },
  hint: { marginTop: 8, fontSize: 12.5, color: colors.textTertiary, lineHeight: 17 },
  form: { flexDirection: 'row', gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    fontSize: 17,
    backgroundColor: colors.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  history: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
    paddingTop: 10,
    gap: 8,
  },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyValue: { flex: 1, fontSize: 14.5, fontWeight: '600', color: '#3E3E44' },
  historyDate: { fontSize: 13, color: colors.textSecondary },
  historyDelete: { fontSize: 12, color: colors.textTertiary, fontWeight: '700' },
  deleteLatest: { marginTop: 12 },
  deleteLatestText: { fontSize: 13, color: colors.danger, fontWeight: '600' },
});
