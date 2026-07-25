import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui';
import { plannedMealResult, type PlannedMeal } from '@/services/program';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

/** The portions a real plate actually comes in. */
const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5] as const;
const PORTION_LABEL: Record<string, string> = {
  '0.5': '½',
  '0.75': '¾',
  '1': '1',
  '1.25': '1¼',
  '1.5': '1½',
};

/**
 * The gate between "the coach planned this" and "this is in my journal".
 *
 * Nothing is written until the patient confirms here — and because they can
 * say they ate half of it, what lands in the journal is what they really
 * ate, not what the plan hoped for. The carbohydrate shown is the exact
 * figure the bolus screen will receive.
 */
export function MealDoneModal({
  meal,
  suggestedPortion = 1,
  onClose,
  onConfirm,
}: {
  /** Mounted only while a meal is being confirmed, so each opening is fresh. */
  meal: PlannedMeal;
  /**
   * Where the selector starts. When the coach has trimmed this meal (the
   * day ran over, glucose is high), it opens on the smaller portion it is
   * asking for instead of making the patient work it out.
   */
  suggestedPortion?: number;
  onClose: () => void;
  /** `dose` asks to continue to the bolus calculator with these carbs. */
  onConfirm: (portion: number, dose: boolean) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [portion, setPortion] = useState(suggestedPortion);
  const [busy, setBusy] = useState<'save' | 'dose' | null>(null);

  // Recomputed from the database-backed ingredient rows on every tap, so the
  // numbers on the button are the numbers that get saved.
  const result = useMemo(() => plannedMealResult(meal, portion), [meal, portion]);

  const run = async (dose: boolean) => {
    if (busy) return;
    setBusy(dose ? 'dose' : 'save');
    try {
      await onConfirm(portion, dose);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <View style={styles.head}>
              <Text style={styles.emoji}>{meal.emoji || '🍽️'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.slot}>{t(`bolus.meal_${meal.slot}`)}</Text>
                <Text style={styles.title}>{meal.title}</Text>
              </View>
            </View>

            <Text style={styles.question}>{t('program.portionQ')}</Text>
            <View style={styles.portionRow}>
              {PORTIONS.map((p) => {
                const on = p === portion;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPortion(p)}
                    style={[styles.portionChip, on && styles.portionChipOn]}
                  >
                    <Text style={[styles.portionText, on && styles.portionTextOn]}>
                      {PORTION_LABEL[String(p)]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* What will be written to the journal — no surprises. */}
            <View style={styles.macroBox}>
              <View style={styles.macroCell}>
                <Text style={styles.macroValue}>{Math.round(result.carbohydrates)} g</Text>
                <Text style={styles.macroLabel}>{t('program.macro_carbs')}</Text>
              </View>
              <View style={styles.macroCell}>
                <Text style={styles.macroValue}>{Math.round(result.calories)}</Text>
                <Text style={styles.macroLabel}>kcal</Text>
              </View>
              <View style={styles.macroCell}>
                <Text style={styles.macroValue}>{Math.round(result.sugar)} g</Text>
                <Text style={styles.macroLabel}>{t('result.sugar')}</Text>
              </View>
              <View style={styles.macroCell}>
                <Text style={styles.macroValue}>{Math.round(result.protein)} g</Text>
                <Text style={styles.macroLabel}>{t('program.macro_protein')}</Text>
              </View>
            </View>

            {result.items?.length ? (
              <View style={styles.items}>
                {result.items.map((it, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.itemGrams}>{Math.round(it.portion_grams)} g</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.note}>{t('program.logNote')}</Text>

            <Pressable onPress={() => run(false)} disabled={!!busy} style={styles.primary}>
              {busy === 'save' ? (
                <Spinner size={20} color="#ffffff" />
              ) : (
                <Text style={styles.primaryText}>✓ {t('program.confirmEaten')}</Text>
              )}
            </Pressable>

            <Pressable onPress={() => run(true)} disabled={!!busy} style={styles.secondary}>
              {busy === 'dose' ? (
                <Spinner size={20} color={INK} />
              ) : (
                <Text style={styles.secondaryText}>
                  💉 {t('program.confirmAndDose', { carbs: Math.round(result.carbohydrates) })}
                </Text>
              )}
            </Pressable>

            <Pressable onPress={onClose} disabled={!!busy} style={styles.cancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '86%',
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    ...shadows.card,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 32 },
  slot: { fontFamily: F600, fontSize: 11.5, color: GREEN },
  title: { fontFamily: F800, fontSize: 16.5, color: INK, marginTop: 1 },

  question: { fontFamily: F700, fontSize: 12.5, color: '#41505f', marginTop: 18 },
  portionRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  portionChip: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#e4e8ef',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionChipOn: { borderColor: GREEN, backgroundColor: '#eafaf1' },
  portionText: { fontFamily: F800, fontSize: 15, color: '#8a98a7' },
  portionTextOn: { color: '#0f7a42' },

  macroBox: {
    flexDirection: 'row',
    backgroundColor: '#f6f8fb',
    borderRadius: 16,
    padding: 13,
    marginTop: 14,
  },
  macroCell: { flex: 1, alignItems: 'center' },
  macroValue: { fontFamily: F800, fontSize: 15, color: INK },
  macroLabel: { fontFamily: F600, fontSize: 10, color: '#8a98a7', marginTop: 2 },

  items: { marginTop: 12, gap: 5 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemName: { flex: 1, fontFamily: F600, fontSize: 12, color: '#5d6b7c' },
  itemGrams: { fontFamily: F700, fontSize: 12, color: '#8a98a7' },

  note: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#8a98a7',
    marginTop: 14,
  },

  primary: {
    height: 50,
    borderRadius: 15,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  primaryText: { fontFamily: F700, fontSize: 14.5, color: '#ffffff' },
  secondary: {
    height: 48,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 9,
  },
  secondaryText: { fontFamily: F700, fontSize: 13.5, color: INK },
  cancel: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontFamily: F600, fontSize: 13, color: '#8a98a7' },
});
