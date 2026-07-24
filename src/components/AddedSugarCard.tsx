import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';

import { AnimatedRobot } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { parseDecimal, sanitizeDecimal } from '@/lib/num';
import { capturePhoto } from '@/services/imageInput';
import { sendMealEdit } from '@/services/mealEdit';
import type { FoodItemResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const AMBER = '#E8912A';
const AMBER_D = '#B9701A';
/** Readable twin of AMBER_D for TYPE (#B9701A is only 3.6:1 on the card). */
const AMBER_TXT = '#8A5310';
const AMBER_BG = '#FDF4E5';
const INK = '#3a2e12';
const MUTED = '#7d6234';

/** search_name marker the parent uses to identify the single added-sugar row. */
export const SUGAR_SEARCH_NAME = 'sugar';
/** One sugar cube / heaped teaspoon ≈ 4 g (confirmed with the user). */
const GRAMS_PER_CUBE = 4;

/**
 * Foods that commonly get sugar added at the table (sweet tea, coffee, juice,
 * yoghurt…). Detection is a local, offline nudge — a false positive only shows
 * an optional card the patient can ignore. Accents are stripped before match.
 */
const SWEETEN_KEYWORDS = [
  'the', 'tea', 'atay', 'atai', 'cafe', 'coffee', 'qahwa', 'qahoua', 'kahwa',
  'jus', 'juice', 'assir', '3assir', 'soda', 'cola', 'limonade', 'yaourt',
  'yogurt', 'yoghurt', 'lben', 'raib', 'smoothie', 'milkshake', 'frappe',
  'cappuccino', 'latte', 'chocolat chaud', 'hot chocolate', 'nes', 'nous nous',
];

const strip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Name of the first sweetenable food on the plate, or null. */
function sweetenableName(items: FoodItemResult[]): string | null {
  for (const it of items) {
    if (it.search_name === SUGAR_SEARCH_NAME) continue; // ignore our own row
    const cat = it.category;
    if (cat === 'Drink' || cat === 'Dessert') return it.name;
    const n = strip(it.name);
    if (SWEETEN_KEYWORDS.some((kw) => new RegExp(`\\b${kw}\\b`).test(n))) return it.name;
  }
  return null;
}

type Unit = 'grams' | 'cubes';

/* ─────────────────────────── Icons ─────────────────────────── */
function CameraGlyph({ color = AMBER_D }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

/**
 * "Added sugar?" card shown under the detected-foods list on the analysis
 * page when a sweetenable food is on the plate. The patient declares how much
 * sugar they added — by grams, by cubes (≈4 g each), or by photographing it and
 * letting the AI estimate. `onSetGrams` replaces the single sugar row on the
 * plate (0 removes it), so totals / GI / score always recompute cleanly.
 */
export function AddedSugarCard({
  items,
  language,
  onSetGrams,
}: {
  items: FoodItemResult[];
  language: string;
  onSetGrams: (grams: number) => void;
}) {
  const { t } = useTranslation();

  const food = sweetenableName(items);
  const existing = items.find((it) => it.search_name === SUGAR_SEARCH_NAME);

  const [unit, setUnit] = useState<Unit>('cubes');
  const [amount, setAmount] = useState('2');
  const [addedGrams, setAddedGrams] = useState<number | null>(
    existing ? Math.round(existing.portion_grams) : null
  );
  const [editing, setEditing] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

  // No sweetenable food and nothing added yet → render nothing.
  if (!food && addedGrams === null) return null;

  const gramsFromInput = () => {
    const n = Math.max(0, Math.round(parseDecimal(amount) ?? 0));
    return unit === 'cubes' ? n * GRAMS_PER_CUBE : n;
  };

  const commit = (grams: number) => {
    onSetGrams(grams);
    setAddedGrams(grams > 0 ? grams : null);
    setEditing(false);
  };

  const onAdd = () => {
    const g = gramsFromInput();
    if (g <= 0) return;
    commit(g);
  };

  const onRemove = () => {
    onSetGrams(0);
    setAddedGrams(null);
    setEditing(false);
  };

  const startEdit = () => {
    setUnit('grams');
    setAmount(String(addedGrams ?? gramsFromInput()));
    setEditing(true);
  };

  // From the camera window: fill the input with the AI estimate so the patient
  // can adjust before adding.
  const onEstimate = (grams: number) => {
    setUnit('grams');
    setAmount(String(Math.max(1, Math.round(grams))));
  };

  // ── Compact "added" state ──
  if (addedGrams !== null && !editing) {
    return (
      <View style={[styles.card, styles.addedCard]}>
        <View style={styles.addedIcon}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 6 9 17l-5-5" />
          </Svg>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.addedText}>{t('analysis.sugarAdded', { g: addedGrams })}</Text>
        </View>
        <Pressable onPress={startEdit} style={styles.linkBtn} hitSlop={6}>
          <Text style={styles.linkText}>{t('analysis.sugarModify')}</Text>
        </Pressable>
        <Pressable onPress={onRemove} style={styles.linkBtn} hitSlop={6}>
          <Text style={[styles.linkText, { color: '#c0563a' }]}>{t('analysis.sugarRemove')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Input state ──
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.robot}>
          <AnimatedRobot size={30} mood="happy" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title}>{t('analysis.sugarCardTitle')}</Text>
          <Text style={styles.body}>
            {t('analysis.sugarCardBody', { food: food ?? t('analysis.sugarName') })}
          </Text>
        </View>
      </View>

      {/* Unit toggle */}
      <View style={styles.segRow}>
        <SegBtn label={t('analysis.sugarUnitCubes')} active={unit === 'cubes'} onPress={() => setUnit('cubes')} />
        <SegBtn label={t('analysis.sugarUnitGrams')} active={unit === 'grams'} onPress={() => setUnit('grams')} />
      </View>

      {/* Stepper + amount */}
      <View style={styles.stepRow}>
        <Pressable
          style={styles.stepBtn}
          onPress={() => setAmount((a) => String(Math.max(0, Math.round(parseDecimal(a) ?? 0) - 1)))}
          hitSlop={6}
        >
          <Text style={styles.stepSign}>−</Text>
        </Pressable>
        <View style={styles.amountBox}>
          <TextInput
            value={amount}
            onChangeText={(v) => setAmount(sanitizeDecimal(v))}
            keyboardType="decimal-pad"
            style={styles.amountInput}
            maxLength={4}
          />
          <Text style={styles.amountUnit} numberOfLines={1}>
            {/* Dedicated inline key instead of .toLowerCase() on the button
                label: German nouns stay capitalised ("Stück", not "stück"),
                and case folding is not a safe transform on translated text. */}
            {unit === 'cubes' ? t('analysis.sugarUnitCubesInline') : 'g'}
          </Text>
        </View>
        <Pressable
          style={styles.stepBtn}
          onPress={() => setAmount((a) => String(Math.round(parseDecimal(a) ?? 0) + 1))}
          hitSlop={6}
        >
          <Text style={styles.stepSign}>+</Text>
        </Pressable>
      </View>
      {unit === 'cubes' ? <Text style={styles.hint}>{t('analysis.sugarCubeHint')}</Text> : null}

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable style={styles.photoBtn} onPress={() => setCamOpen(true)}>
          <CameraGlyph />
          <Text style={styles.photoText}>{t('analysis.sugarUnknownPhoto')}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.addBtn} onPress={onAdd}>
        <Text style={styles.addText}>{t('analysis.sugarAdd')}</Text>
      </Pressable>

      <SugarCameraModal
        open={camOpen}
        items={items}
        language={language}
        onClose={() => setCamOpen(false)}
        onEstimate={onEstimate}
        onConfirm={(g) => {
          setCamOpen(false);
          commit(Math.max(1, Math.round(g)));
        }}
      />
    </View>
  );
}

function SegBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.seg, active && styles.segActive]} onPress={onPress}>
      <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ───────────────────────── In-page camera window ───────────────────────── */

/**
 * Small camera window that opens over the analysis page. The patient frames the
 * sugar / drink, snaps it, and the AI estimates the amount in grams — shown with
 * Add / Retake / Cancel. Falls back to the OS camera when a live preview can't
 * mount (web without getUserMedia, permission denied, mount error).
 */
function SugarCameraModal({
  open,
  items,
  language,
  onClose,
  onEstimate,
  onConfirm,
}: {
  open: boolean;
  items: FoodItemResult[];
  language: string;
  onClose: () => void;
  onEstimate: (grams: number) => void;
  onConfirm: (grams: number) => void;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [camError, setCamError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const isWeb = Platform.OS === 'web';
  const webCamSupported =
    isWeb && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const liveCamera = !camError && !!permission?.granted && (!isWeb || webCamSupported);

  // Reset transient state during render when the window (re)opens — the
  // render-phase sync pattern avoids a setState-in-effect cascade.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEstimate(null);
      setBusy(false);
      setCamError(false);
    }
  }

  // Ask for camera permission when the window opens (side effect only).
  useEffect(() => {
    if (open && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [open, permission, requestPermission]);

  const estimateFrom = async (base64: string) => {
    setBusy(true);
    try {
      const res = await sendMealEdit(
        items,
        [{ role: 'user', content: SUGAR_PROMPT }],
        language,
        { image: base64.replace(/^data:image\/[^;]+;base64,/, '') }
      );
      const g = res.proposal?.grams;
      const grams = g && g > 0 ? Math.round(g) : 8; // sane default → user adjusts
      setEstimate(grams);
      onEstimate(grams);
    } catch {
      setEstimate(8);
      onEstimate(8);
    } finally {
      setBusy(false);
    }
  };

  const snapLive = async () => {
    if (!cameraRef.current || busy) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (photo?.base64) await estimateFrom(photo.base64);
    } catch {
      setCamError(true);
    }
  };

  const snapSystem = async () => {
    if (busy) return;
    const picked = await capturePhoto();
    if (picked?.base64) await estimateFrom(picked.base64);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.camOverlay}>
        <View style={styles.camCard}>
          <View style={styles.camHead}>
            <Text style={styles.camTitle}>{t('analysis.sugarCameraTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.camClose}>
              <Text style={{ fontSize: 16, color: '#7a6a4a' }}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.viewport}>
            {liveCamera ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                onMountError={() => setCamError(true)}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.viewportPh]}>
                <CameraGlyph color="#c9ad78" />
                <Text style={styles.viewportPhText}>{t('analysis.sugarPhotoHint')}</Text>
              </View>
            )}
            {busy ? (
              <View style={[StyleSheet.absoluteFill, styles.busyVeil]}>
                <Spinner size={26} color="#fff" />
                <Text style={styles.busyText}>{t('analysis.sugarEstimating')}</Text>
              </View>
            ) : null}
          </View>

          {estimate !== null && !busy ? (
            <>
              <Text style={styles.estimate}>{t('analysis.sugarEstimate', { g: estimate })}</Text>
              <View style={styles.camActions}>
                <Pressable style={[styles.camBtn, styles.camBtnGhost]} onPress={() => setEstimate(null)}>
                  <Text style={styles.camBtnGhostText}>{t('analysis.sugarRetake')}</Text>
                </Pressable>
                <Pressable style={[styles.camBtn, styles.camBtnPrimary]} onPress={() => onConfirm(estimate)}>
                  <Text style={styles.camBtnPrimaryText}>{t('analysis.sugarAdd')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              style={[styles.shutterBtn, busy && { opacity: 0.5 }]}
              onPress={liveCamera ? snapLive : snapSystem}
              disabled={busy}
            >
              <CameraGlyph color="#fff" />
              <Text style={styles.shutterText}>
                {liveCamera ? t('analysis.sugarCameraTitle') : t('analysis.sugarOpenCamera')}
              </Text>
            </Pressable>
          )}

          <Pressable onPress={onClose} style={styles.cancelLink} hitSlop={6}>
            <Text style={styles.cancelLinkText}>{t('analysis.sugarCancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const SUGAR_PROMPT =
  "Regarde la photo et estime UNIQUEMENT la quantité de sucre ajouté visible " +
  "(sucre en poudre, morceaux/cubes, ou sirop sucré) en grammes. Propose cet " +
  'ajout de sucre.';

const styles = StyleSheet.create({
  card: {
    backgroundColor: AMBER_BG,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f2e2c4',
    gap: 12,
  },
  head: { flexDirection: 'row', gap: 11 },
  robot: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F800, fontSize: 13.5, color: AMBER_TXT },
  body: { fontFamily: F500, fontSize: 11.5, lineHeight: 16.5, color: '#7d6234', marginTop: 3 },

  segRow: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#f0e2c6',
    alignItems: 'center',
  },
  segActive: { backgroundColor: AMBER, borderColor: AMBER },
  segText: { fontFamily: F700, fontSize: 12, color: AMBER_TXT },
  // Dark ink on the amber pill (5.4:1) rather than white (2.5:1) — the active
  // segment stays obviously selected and the label is actually readable.
  segTextActive: { color: INK },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#f0e2c6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { fontFamily: F800, fontSize: 20, color: AMBER_TXT, lineHeight: 22 },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 96,
    // On web a TextInput is an <input>, which carries a large intrinsic width
    // (~280 px). Without these the box outgrew the row and pushed the − / +
    // steppers outside the card. Shrinking is capped by minWidth above.
    flexShrink: 1,
    maxWidth: 150,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f0e2c6',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  amountInput: {
    fontFamily: F800,
    fontSize: 22,
    color: INK,
    // Fixed width (not minWidth): on web the <input>'s intrinsic size would
    // otherwise blow the row apart. 4 digits max fit comfortably.
    width: 54,
    flexShrink: 0,
    textAlign: 'center',
    padding: 0,
  },
  amountUnit: { fontFamily: F600, fontSize: 12, color: MUTED, flexShrink: 1 },
  hint: { fontFamily: F500, fontSize: 10.5, color: MUTED, textAlign: 'center', marginTop: -4 },

  actionRow: { flexDirection: 'row' },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#e6c98f',
    backgroundColor: '#fffaf1',
  },
  photoText: { fontFamily: F700, fontSize: 12, color: AMBER_TXT },
  addBtn: {
    backgroundColor: AMBER_TXT,
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addText: { fontFamily: F800, fontSize: 13.5, color: '#fff' },

  // Added (compact) state
  addedCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addedIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#37B24D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addedText: { fontFamily: F800, fontSize: 12.5, color: '#2f7a3f' },
  linkBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  linkText: { fontFamily: F700, fontSize: 11.5, color: AMBER_TXT },

  // Camera window
  camOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  camCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  camHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  camTitle: { fontFamily: F800, fontSize: 15, color: INK },
  camClose: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3ecde', alignItems: 'center', justifyContent: 'center' },
  viewport: {
    height: 210,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1a1712',
  },
  viewportPh: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#241f16', paddingHorizontal: 20 },
  viewportPhText: { fontFamily: F600, fontSize: 12, color: '#c9ad78', textAlign: 'center', lineHeight: 17 },
  busyVeil: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(20,16,10,0.55)' },
  busyText: { fontFamily: F700, fontSize: 12.5, color: '#fff' },

  estimate: { fontFamily: F800, fontSize: 18, color: AMBER_D, textAlign: 'center' },
  camActions: { flexDirection: 'row', gap: 10 },
  camBtn: { flex: 1, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  camBtnGhost: { backgroundColor: '#f3ecde' },
  camBtnGhostText: { fontFamily: F700, fontSize: 13, color: AMBER_D },
  camBtnPrimary: { backgroundColor: AMBER_D },
  camBtnPrimaryText: { fontFamily: F800, fontSize: 13, color: '#fff' },

  shutterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: AMBER_D,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shutterText: { fontFamily: F800, fontSize: 13.5, color: '#fff' },
  cancelLink: { alignItems: 'center', paddingVertical: 2 },
  cancelLinkText: { fontFamily: F600, fontSize: 12, color: MUTED },
});
