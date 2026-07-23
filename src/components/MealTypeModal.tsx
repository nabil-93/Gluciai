import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import type { MealType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN_D = '#0F7A42';
const INK = '#1e2a23';
const MUTED = '#67736B';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '🍽️',
  dinner: '🌙',
  snack: '🍎',
};

/**
 * Last-chance meal picker. The analysis screen normally pre-selects the meal
 * from the clock, but the hours between meals are genuinely ambiguous (a 16:30
 * plate could be a late lunch or an early dinner), so nothing is guessed there.
 * Saving without a meal opens this window instead of silently filing the plate
 * under the wrong one — the journal, the daily totals and the per-meal insulin
 * ratio all key off this value.
 */
export function MealTypeModal({
  open,
  initial,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Pre-highlighted choice, if the screen had one. */
  initial?: MealType | null;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (meal: MealType) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<MealType | null>(initial ?? null);
  const [wasOpen, setWasOpen] = useState(false);

  // Reset the draft each time the window opens (render-phase sync, the pattern
  // the rest of the app uses instead of a setState-in-effect cascade).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPicked(initial ?? null);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onCancel} />
        <View style={styles.card}>
          <Text style={styles.title}>{t('result.mealMoment')}</Text>
          <Text style={styles.body}>{t('analysis.mealPickerBody')}</Text>

          <View style={styles.grid}>
            {MEAL_TYPES.map((m) => {
              const on = picked === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setPicked(m)}
                  style={[styles.opt, on && styles.optOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={styles.optEmoji}>{EMOJI[m]}</Text>
                  <Text style={[styles.optText, on && styles.optTextOn]} numberOfLines={2}>
                    {t(`mealType.${m}`)}
                  </Text>
                  {on ? (
                    <View style={styles.check}>
                      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M20 6 9 17l-5-5" />
                      </Svg>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.cta, !picked && styles.ctaOff]}
            disabled={!picked || saving}
            onPress={() => picked && onConfirm(picked)}
          >
            <Text style={styles.ctaText}>
              {saving ? t('common.loading') : t('analysis.save')}
            </Text>
          </Pressable>
          <Pressable onPress={onCancel} disabled={saving} style={styles.cancel} hitSlop={6}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    gap: 12,
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  title: { fontFamily: F800, fontSize: 16, color: INK },
  body: { fontFamily: F500, fontSize: 12, lineHeight: 17, color: MUTED, marginTop: -6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  opt: {
    // two per row, whatever the translated label length
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#e3e7e0',
    backgroundColor: '#fbfcfa',
  },
  optOn: { borderColor: GREEN_D, backgroundColor: '#EAF7EF' },
  optEmoji: { fontSize: 20 },
  optText: { fontFamily: F700, fontSize: 11.5, color: '#5C6860', textAlign: 'center' },
  optTextOn: { color: GREEN_D },
  check: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: GREEN_D,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cta: {
    backgroundColor: GREEN_D,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  ctaOff: { backgroundColor: '#c3ccc6' },
  ctaText: { fontFamily: F800, fontSize: 13.5, color: '#fff' },
  cancel: { alignItems: 'center', paddingVertical: 2 },
  cancelText: { fontFamily: F700, fontSize: 12, color: MUTED },
});
