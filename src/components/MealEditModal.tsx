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

import { ScanAddSheet } from '@/components/ScanAddSheet';
import { Spinner } from '@/components/ui/Spinner';
import { reidentifyItem, rescaleItem, resolveFood } from '@/services/nutrition/engine';
import { clampPortionGrams } from '@/services/nutrition/plausibility';
import {
  densityFor,
  gramsToUnit,
  isLiquid,
  unitOf,
  unitToGrams,
  type PortionUnit,
} from '@/services/nutrition/portionUnit';
import { useAppStore } from '@/store/useAppStore';
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
  /**
   * The number as the patient sees it, expressed in `unit` below — NOT
   * necessarily grams. Grams are derived on save; see `portionUnit.ts`.
   */
  amount: string;
  unit: PortionUnit;
  category?: FoodCategory;
  /** English query name, kept for the density lookup and reused on save. */
  search_name?: string;
}

let _rowSeq = 0;
const newKey = () => `r${(_rowSeq += 1)}`;
const makeEmptyRow = (): Row => ({
  key: newKey(),
  origin: null,
  name: '',
  amount: '100',
  unit: 'g',
});

const UNITS: readonly PortionUnit[] = ['g', 'ml'];

/** Grams per ml for this row's food — 1.00 for everything not a named liquid. */
const rowDensity = (r: Row) =>
  densityFor({ name: r.name, search_name: r.search_name, category: r.category });

/**
 * Does this row get the g/ml picker?
 *
 * Pourable foods do. So does anything ALREADY written in ml — a food switched
 * before this rule existed, or one whose name the patient has since edited out
 * of recognition, must never be stranded in a unit it cannot leave.
 */
const showsUnitPicker = (r: Row) =>
  r.unit === 'ml' ||
  isLiquid({ name: r.name, search_name: r.search_name, category: r.category });

/** The row's portion in grams, which is the only thing the engine computes on. */
const rowGrams = (r: Row) =>
  clampPortionGrams(unitToGrams(Number(r.amount) || 0, r.unit, rowDensity(r)));

/** One tap of +/−. Read in the row's OWN unit: 10 g of rice and 10 ml of milk
 *  are both the step a person would take, and a step converted from grams
 *  would land on 9 or 11 ml and look broken. */
const AMOUNT_STEP = 10;

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
  const [scanOpen, setScanOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  /* The scanner can be switched off for an account from the admin dashboard.
     The main scan screen checks this before it ever shows a camera; without
     the same check here the button would open, take a photo, and come back
     with "vérifiez votre connexion" for what is actually a 403. Offering it
     and then refusing is worse than not offering it. */
  const scannerLocked = useAppStore((s) => s.lockedFeatures.includes('scanner'));

  // Seed the draft from the current plate when the modal transitions to open.
  // Done during render (guarded so it runs once per open) — the pattern React
  // recommends for resetting state on a prop change, instead of an effect.
  if (open && !wasOpen) {
    setWasOpen(true);
    setBusy(false);
    setScanOpen(false);
    const seeded: Row[] = items.map((it) => {
      // A drink arrives in ml unless this food already carries its own choice.
      const unit = unitOf(it);
      return {
        key: newKey(),
        origin: it,
        name: it.name,
        amount: String(gramsToUnit(it.portion_grams, unit, densityFor(it))),
        unit,
        category: it.category,
        search_name: it.search_name,
      };
    });
    if (startWithNewRow || seeded.length === 0) seeded.push(makeEmptyRow());
    setRows(seeded);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const patch = (key: string, next: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));

  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const bumpAmount = (key: string, delta: number) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const d = rowDensity(r);
        const stepped = Math.round(Number(r.amount) || 0) + delta;
        // Bounded to a portion a person could eat (5–2000 g, the same range
        // `analyze-meal` applies to the vision estimate). The four-digit field
        // previously accepted 9999 g, and every macro — including the one the
        // dose is computed from — scales linearly with this number. The bound
        // is applied in GRAMS, then written back in the row's unit, so the
        // limit means the same amount of food whichever unit is on screen.
        const grams = clampPortionGrams(unitToGrams(stepped, r.unit, d));
        return { ...r, amount: String(gramsToUnit(grams, r.unit, d)) };
      })
    );

  /**
   * Switch ONE row between grams and millilitres.
   *
   * This re-expresses the portion; it does not change it. 100 g of milk becomes
   * "97 ml" — the same milk, so the nutrition, the score and the dose all stay
   * exactly where they were. Only editing the number afterwards changes the
   * food. A toggle that silently re-weighed the plate would be a dosing bug
   * dressed as a formatting feature.
   */
  const setUnit = (key: string, next: PortionUnit) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key || r.unit === next) return r;
        const d = rowDensity(r);
        const grams = unitToGrams(Number(r.amount) || 0, r.unit, d);
        return { ...r, unit: next, amount: String(gramsToUnit(grams, next, d)) };
      })
    );

  const addRow = () => {
    setRows((rs) => [...rs, makeEmptyRow()]);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  /**
   * Foods the patient ticked in the scan sheet, appended to the draft.
   *
   * They arrive as fully resolved items, so each keeps `origin` — its
   * database provenance, its per-100g values, its carb-known flag. That is
   * what makes a scanned addition worth the same as a scanned plate: on save
   * it takes the `rescaleItem` path, not the "look this name up again" path.
   */
  const addScanned = (items: FoodItemResult[]) => {
    setRows((rs) => {
      const added: Row[] = items.map((it) => {
        const unit = unitOf(it);
        return {
          key: newKey(),
          origin: it,
          name: it.name,
          amount: String(gramsToUnit(it.portion_grams, unit, densityFor(it))),
          unit,
          category: it.category,
          search_name: it.search_name,
        };
      });
      // A blank row the patient never filled would otherwise sit above the
      // scan's results looking like something went wrong. It contributes
      // nothing on save either way.
      const kept = rs.filter((r) => r.origin !== null || r.name.trim().length > 0);
      return [...kept, ...added];
    });
    setScanOpen(false);
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
        // Back to grams — the only quantity anything downstream computes on.
        const grams = rowGrams(r);
        if (!name) continue;
        if (r.origin) {
          let item = r.origin;
          const renamed = name.toLowerCase() !== r.origin.name.trim().toLowerCase();
          // Re-resolve nutrition when the food identity changed…
          if (renamed) item = await reidentifyItem(r.origin, name);
          // …then rescale linearly to the corrected portion.
          if (Math.round(item.portion_grams) !== grams) item = rescaleItem(item, grams);
          out.push({ ...item, name, portion_unit: r.unit });
        } else {
          const resolved = await resolveFood(
            {
              name,
              search_name: r.search_name ?? name,
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
          if (resolved) out.push({ ...resolved, name, portion_unit: r.unit });
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
                      <Pressable style={styles.stepBtn} onPress={() => bumpAmount(r.key, -AMOUNT_STEP)} disabled={busy} hitSlop={6}>
                        <Svg width={13} height={13} viewBox="0 0 24 24" stroke="#3a463f" strokeWidth={2.6} strokeLinecap="round">
                          <Path d="M5 12h14" />
                        </Svg>
                      </Pressable>
                      <TextInput
                        value={r.amount}
                        onChangeText={(v) => patch(r.key, { amount: v.replace(/[^0-9]/g, '') })}
                        keyboardType="number-pad"
                        style={styles.gramInput}
                        editable={!busy}
                        maxLength={4}
                      />
                      {/* BOTH units are shown, and only on a liquid.
                          A single pill that flipped on tap hid the choice: you
                          had to already know it was a button to discover it
                          was one. Two visible options say what is available and
                          which one is on. On a steak there is nothing to
                          choose, so the row keeps a plain "g" — a switch on
                          every row of every plate is noise. A poured food
                          arrives in ml on its own. */}
                      {showsUnitPicker(r) ? (
                        <View style={styles.unitSeg}>
                          {UNITS.map((u) => {
                            const on = r.unit === u;
                            return (
                              <Pressable
                                key={u}
                                style={[styles.unitOpt, on && styles.unitOptOn]}
                                onPress={() => setUnit(r.key, u)}
                                disabled={busy}
                                hitSlop={4}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={t('analysis.switchUnit')}
                              >
                                <Text style={[styles.unitOptText, on && styles.unitOptTextOn]}>
                                  {u}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.gramUnit}>g</Text>
                      )}
                      <Pressable style={styles.stepBtn} onPress={() => bumpAmount(r.key, AMOUNT_STEP)} disabled={busy} hitSlop={6}>
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

            {/* Add a food — by name, or by camera.
                Typing assumes you know what the thing is called. A regional
                dish, a sauce, a packaged snack in a script you do not read:
                the camera already answers that everywhere else in the app, so
                it answers it here too. */}
            <View style={styles.addBar}>
              <Pressable style={[styles.addRow, { flex: 1 }]} onPress={addRow} disabled={busy}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round">
                  <Path d="M12 5v14M5 12h14" />
                </Svg>
                <Text style={styles.addRowText}>{t('analysis.addFood')}</Text>
              </Pressable>
              {!scannerLocked && (
                <Pressable style={styles.scanBtn} onPress={() => setScanOpen(true)} disabled={busy}>
                  {/* Filled glyph, like the tab bar's — the app's icons have
                      weight; a thin outline camera would read as a stray sketch. */}
                  <Svg width={17} height={17} viewBox="0 0 24 24">
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      fill={GREEN}
                      d="M9 2 L7.17 4 H4 a2 2 0 0 0 -2 2 v12 a2 2 0 0 0 2 2 h16 a2 2 0 0 0 2 -2 V6 a2 2 0 0 0 -2 -2 h-3.17 L15 2 H9 Z M12 17.2 a5 5 0 1 1 0 -10 a5 5 0 0 1 0 10 Z"
                    />
                  </Svg>
                  <Text style={styles.addRowText}>{t('analysis.scanAdd')}</Text>
                </Pressable>
              )}
            </View>

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

        {/* Camera + pick list. An overlay INSIDE this Modal, not a second
            Modal: stacking two native Modals is unreliable on iOS. */}
        <ScanAddSheet
          open={scanOpen}
          existingNames={rows.map((r) => r.name).filter((n) => n.trim().length > 0)}
          onCancel={() => setScanOpen(false)}
          onAdd={addScanned}
        />
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
  /** A solid has no choice to make: the unit is a caption, as it always was. */
  gramUnit: { fontSize: 11, fontFamily: F600, color: MUTED, marginLeft: -2 },

  /** A liquid gets both units, side by side, with the active one lifted onto
   *  white. Same height as the +/− buttons so the stepper still reads as one
   *  control, and narrow enough that the row survives a 320 px screen. */
  unitSeg: {
    flexDirection: 'row',
    gap: 2,
    padding: 2,
    borderRadius: 9,
    backgroundColor: '#e9ece7',
  },
  unitOpt: {
    minWidth: 23,
    height: 22,
    borderRadius: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitOptOn: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  unitOptText: { fontSize: 10.5, fontFamily: F700, color: '#8d968f' },
  unitOptTextOn: { fontFamily: F800, color: '#158a52' },
  trash: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fdecef',
    alignItems: 'center',
    justifyContent: 'center',
  },

  addBar: { flexDirection: 'row', gap: 8 },
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
  /** Solid, not dashed: typing a name is the open-ended action, scanning is a
   *  definite one. Sized to its label so "Ajouter un aliment" keeps the room. */
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#bfe6d0',
    backgroundColor: '#e7f4ec',
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
