import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import type { MealScan, MealType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#14231C';
const GREEN = '#1FB268';
const ORANGE = '#F2994A';
const PURPLE = '#8B5CF6';
const MUTED = '#8A988F';

const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

/**
 * A quick "peek" at a logged meal — tapped from its photo on the Nutrition
 * page. Shows the photo on top and a scan-style nutrition summary below, with
 * a "Plus de détails" button that opens the full analysis report (the same
 * page shown right after a scan).
 */
export function MealPeekModal({
  meal,
  onClose,
  onDetails,
  onDelete,
}: {
  meal: MealScan | null;
  onClose: () => void;
  onDetails: (meal: MealScan) => void;
  /** Remove this dish from the day (two-step confirm inside the window). */
  onDelete?: (meal: MealScan) => void;
}) {
  const { t, i18n } = useTranslation();

  // Two-step delete confirm; reset (during render) whenever a different dish
  // is opened, so a stale "confirm" never carries over between meals.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lastId, setLastId] = useState(meal?.id);
  if (meal?.id !== lastId) {
    setLastId(meal?.id);
    setConfirmDelete(false);
  }

  const slot = (meal?.meal_type ?? 'snack') as MealType;
  const r = meal?.result;
  const time = meal
    ? new Date(meal.created_at).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <Modal visible={!!meal} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Stop propagation so taps inside the card don't close it */}
        <Pressable style={styles.card} onPress={() => {}}>
          {meal && r ? (
            <>
              <View style={styles.photoWrap}>
                {meal.image_url ? (
                  <Image source={{ uri: meal.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFill, styles.photoPh]}>
                    <Text style={{ fontSize: 46 }}>{MEAL_EMOJI[slot]}</Text>
                  </View>
                )}
                <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
                    <Path d="M18 6 6 18M6 6l12 12" />
                  </Svg>
                </Pressable>
                <View style={styles.momentBadge}>
                  <Text style={styles.momentText}>
                    {MEAL_EMOJI[slot]} {t(`nutritionPage.mt.${slot}`)} · {time}
                  </Text>
                </View>
              </View>

              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={2}>
                  {r.food_name}
                </Text>

                <View style={styles.calRow}>
                  <Text style={styles.calValue}>{Math.round(r.calories)}</Text>
                  <Text style={styles.calUnit}>kcal</Text>
                </View>

                <View style={styles.macroRow}>
                  <Macro label={t('result.carbs')} value={Math.round(r.carbohydrates)} color={ORANGE} />
                  <Macro label={t('result.protein')} value={Math.round(r.protein)} color={GREEN} />
                  <Macro label={t('result.fat')} value={Math.round(r.fat)} color={PURPLE} />
                </View>

                <Pressable style={styles.detailsBtn} onPress={() => onDetails(meal)}>
                  <Text style={styles.detailsText}>{t('nutritionPage.moreDetails')}</Text>
                  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="m9 18 6-6-6-6" />
                  </Svg>
                </Pressable>

                {onDelete ? (
                  <Pressable
                    style={[styles.deleteBtn, confirmDelete && styles.deleteBtnConfirm]}
                    onPress={() => {
                      if (confirmDelete) onDelete(meal);
                      else setConfirmDelete(true);
                    }}
                  >
                    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={confirmDelete ? '#fff' : '#c0563a'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </Svg>
                    <Text style={[styles.deleteText, confirmDelete && styles.deleteTextConfirm]}>
                      {confirmDelete ? t('nutritionPage.deleteConfirm') : t('nutritionPage.deleteMeal')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.macroCol}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>
        {value}
        <Text style={styles.macroG}> g</Text>
      </Text>
      <Text style={styles.macroLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 12,
  },
  photoWrap: { height: 190, backgroundColor: '#e9efec' },
  photoPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef4ef' },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  momentText: { fontFamily: F700, fontSize: 11.5, color: '#fff' },

  body: { padding: 18, gap: 12 },
  name: { fontFamily: F800, fontSize: 18, color: INK, lineHeight: 24 },
  calRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  calValue: { fontFamily: F800, fontSize: 30, color: INK, letterSpacing: -0.5 },
  calUnit: { fontFamily: F600, fontSize: 14, color: MUTED },

  macroRow: {
    flexDirection: 'row',
    backgroundColor: '#F5F8F6',
    borderRadius: 16,
    paddingVertical: 12,
  },
  macroCol: { flex: 1, alignItems: 'center', gap: 3 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroValue: { fontFamily: F800, fontSize: 16, color: INK },
  macroG: { fontFamily: F600, fontSize: 11, color: MUTED },
  macroLabel: { fontFamily: F500, fontSize: 11, color: '#5D6B62' },

  detailsBtn: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 14,
  },
  detailsText: { fontFamily: F800, fontSize: 14.5, color: '#fff' },

  deleteBtn: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#f0d5cc',
    backgroundColor: '#fdf3f0',
    paddingVertical: 12,
  },
  deleteBtnConfirm: { backgroundColor: '#c0563a', borderColor: '#c0563a' },
  deleteText: { fontFamily: F700, fontSize: 13, color: '#c0563a' },
  deleteTextConfirm: { color: '#fff' },
});
