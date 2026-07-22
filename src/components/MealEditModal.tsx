import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/Spinner';
import { reidentifyItem, rescaleItem, resolveFood } from '@/services/nutrition/engine';
import type { FoodCategory, FoodItemResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#20bf6b';
const INK = '#1e2a23';
const MUTED = '#9aa49d';

const EMOJI: Record<FoodCategory, string> = {
  Protein: '🍗',
  Vegetable: '🥦',
  Fruit: '🍎',
  Rice: '🍚',
  Bread: '🍞',
  Pasta: '🍝',
  Soup: '🍲',
  Sauce: '🥫',
  Dessert: '🍰',
  Drink: '🥤',
  Snack: '🍪',
  'Fast Food': '🍔',
  Seafood: '🐟',
  Legumes: '🫘',
  Dairy: '🧀',
  Egg: '🥚',
  Unknown: '🍽️',
};
const TINTS = ['#fbeede', '#f1eee6', '#e9f6ea', '#eaf1fb', '#f6ecf9'];

interface Row {
  key: string;
  /** The original resolved item; null for a food the user is adding. */
  origin: FoodItemResult | null;
  name: string;
  grams: string;
  category?: FoodCategory;
}

let _rowSeq = 0;
const newKey = () => `r${(_rowSeq += 1)}`;
const makeEmptyRow = (): Row => ({ key: newKey(), origin: null, name: '', grams: '100' });

const GRAM_STEP = 10;
const MIN_GRAMS = 5;

/**
 * Centered modal to edit the scanned plate: rename a food, correct a portion,
 * remove one, or add an aliment the AI missed. On save it re-resolves the
 * nutrition through the SAME database chain the scanner uses (never invents
 * values) and hands the recomputed item list back so every result updates.
 */
export function MealEditModal({
  open,
  items,
  startWithNewRow,
  onClose,
  onSaved,
}: {
  open: boolean;
  items: FoodItemResult[];
  /** Open with a fresh empty row ready (the "Ajouter" entry point). */
  startWithNewRow?: boolean;
  onClose: () => void;
  onSaved: (items: FoodItemResult[]) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Seed the draft from the current plate when the modal transitions to open.
  // Done during render (guarded so it runs once per open) — the pattern React
  // recommends for resetting state on a prop change, instead of an effect.
  if (open && !wasOpen) {
    setWasOpen(true);
    setBusy(false);
    const seeded: Row[] = items.map((it) => ({
      key: newKey(),
      origin: it,
      name: it.name,
      grams: String(Math.round(it.portion_grams)),
      category: it.category,
    }));
    if (startWithNewRow || seeded.length === 0) seeded.push(makeEmptyRow());
    setRows(seeded);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const patch = (key: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const bumpGrams = (key: string, delta: number) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const current = Math.round(Number(r.grams) || 0);
        const next = Math.max(MIN_GRAMS, current + delta);
        return { ...r, grams: String(next) };
      })
    );

  const addRow = () => {
    setRows((rs) => [...rs, makeEmptyRow()]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const validCount = rows.filter((r) => r.name.trim().length > 0).length;

  const save = async () => {
    if (busy || validCount === 0) return;
    setBusy(true);
    try {
      const out: FoodItemResult[] = [];
      for (const r of rows) {
        const name = r.name.trim();
        const grams = Math.max(MIN_GRAMS, Math.round(Number(r.grams) || 0));
        if (!name) continue;
        if (r.origin) {
          let item = r.origin;
          const renamed = name.toLowerCase() !== r.origin.name.trim().toLowerCase();
          // Re-resolve nutrition when the food identity changed…
          if (renamed) item = await reidentifyItem(r.origin, name);
          // …then rescale linearly to the corrected portion.
          if (Math.round(item.portion_grams) !== grams) item = rescaleItem(item, grams);
          out.push({ ...item, name });
        } else {
          const resolved = await resolveFood(
            {
              name,
              search_name: name,
              portion_grams: grams,
              confidence: 1,
              is_main_food: false,
              is_estimated: false,
            },
            undefined,
            // Keep a manually-added food visible even if no database knows it
            // (shown with a warning) — never silently drop the user's input.
            { keepUnmatched: true }
          );
          if (resolved) out.push({ ...resolved, name });
        }
      }
      if (out.length === 0) {
        setBusy(false);
        return;
      }
      onSaved(out);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{t('analysis.editFoods')}</Text>
                <Text style={styles.subtitle}>{t('analysis.editHint')}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8} disabled={busy}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#5a655d" strokeWidth={2.4} strokeLinecap="round">
                  <Path d="M18 6 6 18M6 6l12 12" />
                </Svg>
              </Pressable>
            </View>

            {/* Rows */}
            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ gap: 9, paddingVertical: 2 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {rows.map((r, i) => (
                <View key={r.key} style={styles.row}>
                  <View style={[styles.emoji, { backgroundColor: TINTS[i % TINTS.length] }]}>
                    <Text style={{ fontSize: 17 }}>{EMOJI[r.category ?? 'Unknown']}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <TextInput
                      value={r.name}
                      onChangeText={(v) => patch(r.key, { name: v })}
                      placeholder={t('analysis.foodNamePlaceholder')}
                      placeholderTextColor="#b7bfb8"
                      style={styles.nameInput}
                      editable={!busy}
                    />
                    <View style={styles.stepper}>
                      <Pressable style={styles.stepBtn} onPress={() => bumpGrams(r.key, -GRAM_STEP)} disabled={busy} hitSlop={6}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" stroke="#3a463f" strokeWidth={2.6} strokeLinecap="round">
                          <Path d="M5 12h14" />
                        </Svg>
                      </Pressable>
                      <TextInput
                        value={r.grams}
                        onChangeText={(v) => patch(r.key, { grams: v.replace(/[^0-9]/g, '') })}
                        keyboardType="number-pad"
                        style={styles.gramInput}
                        editable={!busy}
                        maxLength={4}
                      />
                      <Text style={styles.gramUnit}>g</Text>
                      <Pressable style={styles.stepBtn} onPress={() => bumpGrams(r.key, GRAM_STEP)} disabled={busy} hitSlop={6}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" stroke="#3a463f" strokeWidth={2.6} strokeLinecap="round">
                          <Path d="M12 5v14M5 12h14" />
                        </Svg>
                      </Pressable>
                    </View>
                  </View>
                  <Pressable style={styles.trash} onPress={() => remove(r.key)} disabled={busy} hitSlop={6}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#d9556b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </Svg>
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            {/* Add a food */}
            <Pressable style={styles.addRow} onPress={addRow} disabled={busy}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
              <Text style={styles.addRowText}>{t('analysis.addFood')}</Text>
            </Pressable>

            {/* Footer */}
            <View style={styles.footer}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={onClose} disabled={busy}>
                <Text style={styles.btnGhostText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSave, (validCount === 0 || busy) && styles.btnDisabled]}
                onPress={save}
                disabled={validCount === 0 || busy}
              >
                {busy ? (
                  <Spinner size={16} color="#fff" />
                ) : (
                  <Text style={styles.btnSaveText}>{t('analysis.saveChanges')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(20,28,23,0.55)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 16, fontFamily: F800, color: INK },
  subtitle: { fontSize: 11, fontFamily: F500, color: MUTED, marginTop: 2, lineHeight: 15 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f0f2ee',
    alignItems: 'center',
    justifyContent: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f9f6',
    borderRadius: 15,
    padding: 9,
  },
  emoji: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nameInput: {
    fontSize: 13,
    fontFamily: F700,
    color: INK,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#e6e9e4',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#eef1ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gramInput: {
    minWidth: 42,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: F800,
    color: INK,
    paddingVertical: 3,
    paddingHorizontal: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6e9e4',
  },
  gramUnit: { fontSize: 11, fontFamily: F600, color: MUTED, marginLeft: -2 },
  trash: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fdecef',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#bfe6d0',
    borderStyle: 'dashed',
    backgroundColor: '#f1faf4',
  },
  addRowText: { fontSize: 12.5, fontFamily: F700, color: '#158a52' },

  footer: { flexDirection: 'row', gap: 10, marginTop: 2 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#f0f2ee' },
  btnGhostText: { fontSize: 13, fontFamily: F700, color: '#5a655d' },
  btnSave: { backgroundColor: GREEN },
  btnSaveText: { fontSize: 13, fontFamily: F800, color: '#fff' },
  btnDisabled: { opacity: 0.45 },
});
