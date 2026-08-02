/**
 * SCAN A FOOD STRAIGHT INTO THE PLATE EDITOR.
 *
 * Why it exists: "Modifier les aliments" could only take a food by NAME, typed.
 * A patient who does not know what something is called — a regional dish, a
 * sauce, a packaged snack in a language they do not read — had no way to add
 * it, which is precisely the case the camera already solves everywhere else.
 *
 * It deliberately runs the SAME pipeline as the main scanner: the shot goes
 * through `prepareImageForVision`, then `analyzeMealImage`, so a food added
 * here is resolved through the identical database chain and arrives carrying
 * real provenance. Nothing here invents nutrition, and nothing here is a
 * cheaper "quick" path — a cheaper path would mean the same plate is worth
 * different numbers depending on which button was pressed.
 *
 * It is an OVERLAY, not a Modal. It renders inside the editor's own Modal, and
 * stacking two native Modals is unreliable on iOS.
 *
 * The patient picks what lands: every detection arrives as a checkbox, because
 * the photo of one forgotten food usually catches the rest of the plate too,
 * and silently re-adding a plate the editor already holds would double it.
 * Anything whose name is already in the list starts UNCHECKED and says so.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';

import { Spinner } from '@/components/ui/Spinner';
import { analyzeMealImage, type ScanStage } from '@/services/ai';
import { prepareImageForVision, scanErrorKey } from '@/services/visionCapture';
import { formatPortion } from '@/services/nutrition/portionUnit';
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

const isWeb = Platform.OS === 'web';

/** The sensor's own portrait shape — the opening guess, corrected on web from
 *  the real <video>, and on native from the first photo. See the note on the
 *  preview box below: a mismatched box CROPS what the patient framed. */
const PREVIEW_ASPECT = 3 / 4;

type Phase = 'camera' | 'analyzing' | 'pick' | 'error';

export function ScanAddSheet({
  open,
  existingNames,
  onCancel,
  onAdd,
}: {
  open: boolean;
  /** Names already in the editor — matches start unchecked, never hidden. */
  existingNames: string[];
  onCancel: () => void;
  onAdd: (items: FoodItemResult[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [stage, setStage] = useState<ScanStage>('detecting');
  const [found, setFound] = useState<FoodItemResult[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [camError, setCamError] = useState(false);
  const [frameAspect, setFrameAspect] = useState(PREVIEW_ASPECT);
  const cameraRef = useRef<CameraView>(null);
  const previewWrapRef = useRef<View>(null);

  // Reset to a clean camera every time the sheet is opened, so a previous
  // scan's result or error never greets the next one.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setPhase('camera');
    setFound([]);
    setChecked([]);
    setErrorMsg(null);
    setCamError(false);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const applyAspect = useCallback((w?: number | null, h?: number | null, forcePortrait = false) => {
    if (!w || !h) return;
    const a = forcePortrait ? Math.min(w, h) / Math.max(w, h) : w / h;
    if (Number.isFinite(a) && a >= 0.3 && a <= 3) setFrameAspect(a);
  }, []);

  /* Web: expo-camera renders a <video> styled `object-fit: cover` and the
   * browser alone decides the stream's shape. Unless this box matches it, the
   * preview shows a crop of what the capture actually sends — you frame one
   * thing and photograph another. The only place that size exists is the
   * element, so read it. */
  useEffect(() => {
    if (!isWeb || !open || phase !== 'camera' || !permission?.granted || camError) return;
    let video: HTMLVideoElement | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => applyAspect(video?.videoWidth, video?.videoHeight);
    const attach = () => {
      const root = previewWrapRef.current as unknown as HTMLElement | null;
      video = root?.querySelector?.('video') ?? null;
      if (!video) {
        if (tries++ < 40) timer = setTimeout(attach, 100);
        return;
      }
      read();
      video.addEventListener('loadedmetadata', read);
      video.addEventListener('resize', read);
    };
    attach();
    return () => {
      if (timer) clearTimeout(timer);
      video?.removeEventListener('loadedmetadata', read);
      video?.removeEventListener('resize', read);
    };
  }, [open, phase, permission?.granted, camError, applyAspect]);

  if (!open) return null;

  const run = async (uri: string, rawBase64?: string) => {
    setPhase('analyzing');
    setStage('detecting');
    setErrorMsg(null);
    try {
      const prepared = await prepareImageForVision(uri);
      const base64 = (prepared?.base64 ?? rawBase64 ?? '').replace(
        /^data:image\/[^;]+;base64,/,
        ''
      );
      if (!base64) {
        setErrorMsg(t('scanner.scanFailed'));
        setPhase('error');
        return;
      }
      const result = await analyzeMealImage(base64, i18n.language, setStage);
      const items = result?.items ?? [];
      if (items.length === 0) {
        // Never invent a food — ask for a better picture.
        setErrorMsg(t('scanner.noDetect'));
        setPhase('error');
        return;
      }
      const already = new Set(existingNames.map((n) => n.trim().toLowerCase()));
      setFound(items);
      setChecked(items.map((it) => !already.has(it.name.trim().toLowerCase())));
      setPhase('pick');
    } catch (e) {
      // Whose fault it was — shared with the main scanner so an overloaded
      // provider is never reported to the patient as their own connection.
      setErrorMsg(t(scanErrorKey(e)));
      setPhase('error');
    }
  };

  const capture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 1 });
      if (!photo?.uri) return;
      // The photo is the ground truth about the frame's shape.
      applyAspect(photo.width, photo.height, true);
      await run(photo.uri, photo.base64 ?? undefined);
    } catch {
      setCamError(true);
    }
  };

  const pickFromLibrary = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 1,
      });
      const asset = picked.assets?.[0];
      if (!asset?.uri) return;
      await run(asset.uri, asset.base64 ?? undefined);
    } catch {
      setErrorMsg(t('scanner.scanFailed'));
      setPhase('error');
    }
  };

  /** No live preview possible (denied, no getUserMedia, mount error): go
   *  through the OS camera, and fall back to the library if that is absent. */
  const captureViaSystem = async () => {
    try {
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 1,
      });
      const asset = shot.assets?.[0];
      if (asset?.uri) {
        await run(asset.uri, asset.base64 ?? undefined);
        return;
      }
      if (!shot.canceled) await pickFromLibrary();
    } catch {
      await pickFromLibrary();
    }
  };

  const toggle = (i: number) =>
    setChecked((c) => c.map((v, idx) => (idx === i ? !v : v)));

  const selected = found.filter((_, i) => checked[i]);

  const liveCamera = !camError && !!permission?.granted;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>
              {phase === 'pick' ? t('analysis.scanPickTitle') : t('analysis.scanAddTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {phase === 'pick' ? t('analysis.scanPickHint') : t('analysis.scanAddHint')}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onCancel} hitSlop={8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#5a655d" strokeWidth={2.4} strokeLinecap="round">
              <Path d="M18 6 6 18M6 6l12 12" />
            </Svg>
          </Pressable>
        </View>

        {/* ── Camera ────────────────────────────────────────────────────── */}
        {phase === 'camera' && (
          <>
            {!permission?.granted ? (
              <View style={styles.permBox}>
                <Text style={styles.permTitle}>{t('scanner.permissionTitle')}</Text>
                <Text style={styles.permDesc}>{t('scanner.permissionDesc')}</Text>
                <Pressable style={styles.primaryBtn} onPress={() => requestPermission()}>
                  <Text style={styles.primaryBtnText}>{t('scanner.grantPermission')}</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} onPress={pickFromLibrary}>
                  <Text style={styles.ghostBtnText}>{t('scanner.gallery')}</Text>
                </Pressable>
              </View>
            ) : liveCamera ? (
              <>
                {/* The preview keeps the SENSOR's shape. expo-camera scales its
                    frame to FILL whatever view it is given and discards the
                    overflow, so a box of the wrong shape hides part of the
                    plate while the capture still sends the whole frame. */}
                <View
                  ref={previewWrapRef}
                  style={[styles.preview, { aspectRatio: frameAspect }]}
                >
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    facing="back"
                    onMountError={() => setCamError(true)}
                  />
                </View>
                <View style={styles.camDock}>
                  <Pressable style={styles.ghostBtn} onPress={pickFromLibrary}>
                    <Text style={styles.ghostBtnText}>{t('scanner.gallery')}</Text>
                  </Pressable>
                  <Pressable style={styles.shutter} onPress={capture} hitSlop={6}>
                    <View style={styles.shutterInner} />
                  </Pressable>
                  <View style={styles.dockSpacer} />
                </View>
              </>
            ) : (
              <View style={styles.permBox}>
                <Text style={styles.permDesc}>{t('scanner.webUpload')}</Text>
                <Pressable style={styles.primaryBtn} onPress={captureViaSystem}>
                  <Text style={styles.primaryBtnText}>{t('analysis.scanAddTitle')}</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} onPress={pickFromLibrary}>
                  <Text style={styles.ghostBtnText}>{t('scanner.gallery')}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {/* ── Analyzing ─────────────────────────────────────────────────── */}
        {phase === 'analyzing' && (
          <View style={styles.busyBox}>
            <Spinner size={26} color={GREEN} />
            <Text style={styles.busyText}>{t(`scanner.stages.${stage}`)}</Text>
          </View>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {phase === 'error' && (
          <View style={styles.busyBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => setPhase('camera')}>
              <Text style={styles.primaryBtnText}>{t('scanner.retake')}</Text>
            </Pressable>
          </View>
        )}

        {/* ── Pick what to add ──────────────────────────────────────────── */}
        {phase === 'pick' && (
          <>
            <ScrollView
              style={{ maxHeight: 300 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              showsVerticalScrollIndicator={false}
            >
              {found.map((it, i) => {
                const dup = !checked[i] && existingNames.some(
                  (n) => n.trim().toLowerCase() === it.name.trim().toLowerCase()
                );
                return (
                  <Pressable
                    key={`${it.name}-${i}`}
                    style={[styles.pickRow, checked[i] && styles.pickRowOn]}
                    onPress={() => toggle(i)}
                  >
                    <View style={[styles.check, checked[i] && styles.checkOn]}>
                      {checked[i] && (
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                          <Path d="M20 6 9 17l-5-5" />
                        </Svg>
                      )}
                    </View>
                    <Text style={{ fontSize: 16 }}>{EMOJI[it.category ?? 'Unknown']}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pickName} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={styles.pickMeta}>
                        {formatPortion(it)}
                        {dup ? ` · ${t('analysis.scanAlreadyListed')}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setPhase('camera')}>
                <Text style={styles.btnGhostText}>{t('scanner.retake')}</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSave, selected.length === 0 && styles.btnDisabled]}
                onPress={() => selected.length > 0 && onAdd(selected)}
                disabled={selected.length === 0}
              >
                <Text style={styles.btnSaveText}>
                  {/* `n`, not `count`: i18next reserves `count` for plural
                      resolution (six forms in Arabic), and this string has no
                      plural variants to resolve to. */}
                  {t('analysis.scanAddSelected', { n: selected.length })}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12,18,14,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
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

  // Live image. No overlay is drawn on top of it: the patient must see exactly
  // what is being sent, with nothing of ours in the way.
  preview: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0B110E',
  },
  camDock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dockSpacer: { width: 92 },
  shutter: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3.5,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 42, height: 42, borderRadius: 21, backgroundColor: GREEN },

  permBox: { gap: 10, paddingVertical: 6 },
  permTitle: { fontSize: 14, fontFamily: F800, color: INK },
  permDesc: { fontSize: 12, fontFamily: F500, color: MUTED, lineHeight: 17 },

  busyBox: { gap: 12, alignItems: 'center', paddingVertical: 26 },
  busyText: { fontSize: 12.5, fontFamily: F600, color: MUTED, textAlign: 'center' },
  errorText: { fontSize: 12.5, fontFamily: F600, color: '#c0455c', textAlign: 'center', lineHeight: 18 },

  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f9f6',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  pickRowOn: { backgroundColor: '#f1faf4', borderColor: '#bfe6d0' },
  check: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.8,
    borderColor: '#cfd6cf',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: GREEN, borderColor: GREEN },
  pickName: { fontSize: 13, fontFamily: F700, color: INK },
  pickMeta: { fontSize: 10.5, fontFamily: F600, color: MUTED, marginTop: 1 },

  primaryBtn: {
    height: 44,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: { fontSize: 13, fontFamily: F800, color: '#fff' },
  ghostBtn: {
    height: 40,
    minWidth: 92,
    borderRadius: 12,
    backgroundColor: '#f0f2ee',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  ghostBtnText: { fontSize: 12.5, fontFamily: F700, color: '#5a655d' },

  footer: { flexDirection: 'row', gap: 10, marginTop: 2 },
  btn: { flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#f0f2ee' },
  btnGhostText: { fontSize: 13, fontFamily: F700, color: '#5a655d' },
  btnSave: { backgroundColor: GREEN },
  btnSaveText: { fontSize: 13, fontFamily: F800, color: '#fff' },
  btnDisabled: { opacity: 0.45 },
});
