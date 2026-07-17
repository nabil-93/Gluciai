import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, LockedScreen, ProgressRing } from '@/components/ui';
import { analyzeMealImage, type ScanStage } from '@/services/ai';
import { setPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, spacing } from '@/theme';

/* Blocked from the admin dashboard? Show the lock instead of the camera. */
export default function ScanScreenGate() {
  const locked = useAppStore((s) => s.lockedFeatures.includes('scanner'));
  const { t } = useTranslation();
  if (locked) return <LockedScreen featureLabel={t('locked.featScanner')} />;
  return <ScanScreen />;
}

/** Green scan progress climbs toward these ceilings per pipeline stage; it
 *  never reaches 100% until the real result is in, then snaps up and routes. */
const STAGE_CEILING: Record<ScanStage, number> = {
  detecting: 22,
  portions: 44,
  searching: 68,
  calculating: 82,
  scoring: 92,
  finalizing: 96,
};

function ScanScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [percent, setPercent] = useState(0);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  // Refs the percent-climb interval reads without re-subscribing.
  const stageRef = useRef<ScanStage>('detecting');
  const finishedRef = useRef(false);
  const routedRef = useRef(false);

  const isWeb = Platform.OS === 'web';
  // Frame is a near-square bracket, centered — sized to the viewport.
  const FRAME = Math.min(winW - 44, 330);

  /* ── Scan-line loop: a glowing green beam sweeps the frame endlessly ── */
  const beam = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beam, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(beam, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [beam]);
  const beamY = beam.interpolate({
    inputRange: [0, 1],
    outputRange: [6, FRAME - 50],
  });

  /* ── Percent driver: climbs toward the current stage ceiling; when the
   *    real result lands it races to 100 and routes to the result screen. ── */
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(() => {
      setPercent((p) => {
        const ceil = finishedRef.current
          ? 100
          : STAGE_CEILING[stageRef.current] ?? 90;
        if (p >= ceil) {
          if (finishedRef.current && p >= 100 && !routedRef.current) {
            routedRef.current = true;
            clearInterval(id);
            setTimeout(() => router.replace('/scan-result'), 280);
          }
          return p;
        }
        // Catch up quickly when far behind, then ease into the ceiling.
        return Math.min(ceil, p + (p < ceil - 14 ? 2 : 1));
      });
    }, 38);
    return () => clearInterval(id);
  }, [analyzing, router]);

  const analyze = async (
    base64: string,
    uri?: string,
    imageSize?: { width: number; height: number }
  ) => {
    finishedRef.current = false;
    routedRef.current = false;
    stageRef.current = 'detecting';
    setPercent(0);
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeMealImage(base64, i18n.language, (s) => {
        stageRef.current = s;
      });
      if (!result) {
        // Never invent food — ask for a better picture.
        setError(t('scanner.noDetect'));
        setAnalyzing(false);
        setCaptured(null);
        return;
      }
      // imageSize = dimensions of the image the model actually analyzed —
      // the coordinate space of its bounding boxes.
      setPendingScan(result, uri, imageSize, base64);
      // The percent interval carries the bar to 100% then routes.
      finishedRef.current = true;
    } catch (e) {
      // Distinguish a temporary AI rate-limit (quota) from other failures,
      // so the user knows to simply retry rather than think it's broken.
      const msg = String((e as Error)?.message ?? e);
      const rateLimited = /429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg);
      setError(
        rateLimited ? t('scanner.rateLimited') : t('scanner.scanFailed')
      );
      setAnalyzing(false);
      setCaptured(null);
    }
  };

  /**
   * Normalize any captured/picked image before sending it to the vision
   * model: resize to 1024px wide (height auto → ASPECT RATIO PRESERVED,
   * never stretched/cropped), re-encode as JPEG 0.8. This guarantees the
   * model always receives the FULL frame at a consistent, detail-rich size
   * — regardless of the phone's raw resolution or the picker's re-encoding
   * quirks. Returns the base64 plus the exact sent dimensions, which are
   * the reference frame for the bounding boxes Gemini sends back.
   */
  const prepareImage = async (
    uri: string
  ): Promise<{ base64: string; width: number; height: number } | null> => {
    try {
      const ctx = ImageManipulator.manipulate(uri);
      ctx.resize({ width: 1024 }); // height omitted → ratio preserved
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({
        base64: true,
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      if (!out.base64) return null;
      // Visible in DevTools — lets us verify exactly what is sent.
      console.log(
        `[scan] sending ${out.width}x${out.height} JPEG, ~${Math.round(out.base64.length / 1024)}KB (b64)`
      );
      return { base64: out.base64, width: out.width, height: out.height };
    } catch (e) {
      console.warn('[scan] prepareImage failed, falling back to raw picker image', e);
      return null; // caller falls back to the picker's own base64 (full image)
    }
  };

  const capture = async () => {
    if (!cameraRef.current || analyzing) return;
    // quality 1: never degrade at capture — prepareImage does the sizing.
    const photo = await cameraRef.current.takePictureAsync({
      base64: true,
      quality: 1,
    });
    if (!photo?.uri) return;
    // Freeze the shot on screen immediately — the scan plays over it.
    setCaptured(photo.uri);
    const prepared = await prepareImage(photo.uri);
    if (prepared) {
      await analyze(prepared.base64, photo.uri, {
        width: prepared.width,
        height: prepared.height,
      });
    } else if (photo.base64) {
      await analyze(photo.base64, photo.uri);
    }
  };

  const pickImage = async () => {
    if (analyzing) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // quality 1 + base64: the picker returns the ORIGINAL file untouched
      // (fallback path); prepareImage produces the normalized copy we send.
      base64: true,
      quality: 1,
    });
    const asset = picked.assets?.[0];
    if (!asset?.uri) return;
    setCaptured(asset.uri);
    const prepared = await prepareImage(asset.uri);
    if (prepared) {
      await analyze(prepared.base64, asset.uri, {
        width: prepared.width,
        height: prepared.height,
      });
    } else if (asset.base64) {
      await analyze(asset.base64, asset.uri);
    }
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /* ── Fallbacks: waiting for permission, or no camera access yet ── */
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Pressable onPress={close} style={[styles.iconBtn, styles.closeAbs, { top: insets.top + spacing.md }]}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <View style={styles.permWrap}>
          <View style={styles.permIcon}>
            <Ionicons name="camera" size={38} color={colors.primary} />
          </View>
          <Text style={styles.permTitle}>{t('scanner.title')}</Text>
          <Text style={styles.permDesc}>
            {isWeb ? t('scanner.webUpload') : t('scanner.permissionDesc')}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!isWeb ? (
            <AppButton
              label={t('scanner.grantPermission')}
              onPress={requestPermission}
              style={{ alignSelf: 'stretch' }}
            />
          ) : null}
          <AppButton
            label={t('scanner.gallery')}
            onPress={pickImage}
            variant={isWeb ? 'primary' : 'secondary'}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live feed, or the frozen shot once a picture is taken */}
      {captured ? (
        <Image
          source={{ uri: captured }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={torch}
        />
      )}

      {/* Legibility scrims, top and bottom */}
      <LinearGradient
        colors={['rgba(8,12,14,0.72)', 'rgba(8,12,14,0)']}
        style={[styles.scrimTop, { height: 220 + insets.top }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(8,12,14,0)', 'rgba(8,12,14,0.55)', 'rgba(8,12,14,0.92)']}
        style={styles.scrimBottom}
        pointerEvents="none"
      />

      {/* Centered scan frame: corner brackets + sweeping beam */}
      <View style={styles.frameLayer} pointerEvents="none">
        <View style={{ width: FRAME, height: FRAME }}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <Animated.View
            style={[styles.beam, { width: FRAME - 12, transform: [{ translateY: beamY }] }]}
          >
            <LinearGradient
              colors={['rgba(25,195,125,0)', 'rgba(25,195,125,0.28)', 'rgba(25,195,125,0)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.beamLine} />
          </Animated.View>
        </View>
      </View>

      {/* Foreground UI (touchable), laid out top → bottom */}
      <View style={[styles.fg, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]} pointerEvents="box-none">
        {/* Top bar */}
        <View style={styles.topGroup} pointerEvents="box-none">
          <View style={styles.topBar} pointerEvents="box-none">
            <Pressable onPress={close} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <View style={styles.livePill}>
              <Ionicons name="sparkles" size={13} color={colors.primary} />
              <Text style={styles.livePillText}>{t('scanner.realtime')}</Text>
            </View>
            <Pressable
              onPress={() => setTorch((v) => !v)}
              style={[styles.iconBtn, torch && styles.iconBtnOn]}
            >
              <Ionicons
                name={torch ? 'flash' : 'flash-off'}
                size={18}
                color={torch ? '#0B1A12' : '#fff'}
              />
            </Pressable>
          </View>

          {!analyzing ? (
            <View style={styles.hero} pointerEvents="none">
              <Text style={styles.heroTitle}>
                {t('scanner.heroTitle')}{' '}
                <Text style={styles.heroAccent}>{t('scanner.heroAccent')}</Text>
              </Text>
              <Text style={styles.heroSub}>{t('scanner.heroSubtitle')}</Text>
            </View>
          ) : null}
        </View>

        {/* Bottom group: checklist + controls, or the analysis card */}
        <View style={styles.bottomGroup} pointerEvents="box-none">
          {analyzing ? (
            <AnalyzingCard percent={percent} uri={captured} t={t} />
          ) : (
            <>
              <View style={styles.checklist} pointerEvents="none">
                <View style={styles.checklistHead}>
                  <Ionicons name="restaurant" size={14} color={colors.primary} />
                  <Text style={styles.checklistTitle}>{t('scanner.checklistTitle')}</Text>
                </View>
                <CheckRow label={t('scanner.check1')} />
                <CheckRow label={t('scanner.check2')} />
                <CheckRow label={t('scanner.check3')} />
              </View>

              {error ? <Text style={styles.errorFloat}>{error}</Text> : null}

              <View style={styles.controls} pointerEvents="box-none">
                <ControlButton
                  icon="images"
                  label={t('scanner.gallery')}
                  onPress={pickImage}
                />
                <Pressable onPress={capture} style={styles.shutter}>
                  <View style={styles.shutterRing} />
                  <View style={styles.shutterCore} />
                </Pressable>
                <ControlButton
                  icon="camera-reverse"
                  label={t('scanner.flip')}
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function CheckRow({ label }: { label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkDot}>
        <Ionicons name="checkmark" size={12} color="#fff" />
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

function ControlButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.ctrl}>
      <View style={styles.ctrlIcon}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

/** Light card that slides in during analysis: thumbnail + live % ring. */
function AnalyzingCard({
  percent,
  uri,
  t,
}: {
  percent: number;
  uri: string | null;
  t: (k: string) => string;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const thumbLineY = shimmer.interpolate({ inputRange: [0, 1], outputRange: [4, 52] });

  return (
    <View style={styles.analyzeCard}>
      <View style={styles.thumb}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
        <Animated.View style={[styles.thumbLine, { transform: [{ translateY: thumbLineY }] }]} />
      </View>
      <View style={styles.analyzeText}>
        <Text style={styles.analyzeTitle}>{t('scanner.analyzingCard')}</Text>
        <Text style={styles.analyzeSub} numberOfLines={2}>
          {t('scanner.analyzingCardSub')}
        </Text>
      </View>
      <ProgressRing
        size={58}
        strokeWidth={6}
        progress={percent / 100}
        color={colors.purple}
        trackColor={colors.ringTrack}
        valueText={`${percent}%`}
        valueColor={colors.purple}
        valueSize={14}
      />
    </View>
  );
}

const GREEN = colors.primary;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E10' },
  centered: { alignItems: 'center', justifyContent: 'center' },

  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 360 },

  // ── Scan frame ──
  frameLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: GREEN,
  },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.lg },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.lg },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.lg },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.lg },
  beam: {
    position: 'absolute',
    top: 0,
    left: 6,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beamLine: {
    height: 2,
    alignSelf: 'stretch',
    backgroundColor: GREEN,
    borderRadius: 2,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Foreground layout ──
  fg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  topGroup: { gap: spacing.xl },
  bottomGroup: { gap: spacing.lg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(20,26,30,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  closeAbs: { position: 'absolute', left: spacing.lg, zIndex: 10 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: 'rgba(20,26,30,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  livePillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  hero: { alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  heroAccent: { color: GREEN },
  heroSub: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
  },

  // ── Checklist ──
  checklist: {
    alignSelf: 'center',
    width: '86%',
    backgroundColor: 'rgba(16,22,26,0.72)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: spacing.md,
    gap: 9,
  },
  checklistHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 1 },
  checklistTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: 'rgba(255,255,255,0.86)', fontSize: 13.5, fontWeight: '500' },

  // ── Bottom controls ──
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
  },
  ctrl: { alignItems: 'center', gap: 6, width: 72 },
  ctrlIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(20,26,30,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  shutter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: GREEN,
  },
  shutterCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },

  // ── Analyzing card ──
  analyzeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: 14,
    marginHorizontal: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  thumbLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  analyzeText: { flex: 1, minWidth: 0 },
  analyzeTitle: { fontSize: 15.5, fontWeight: '800', color: colors.text },
  analyzeSub: { marginTop: 3, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },

  // ── Permission / fallback ──
  permWrap: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    maxWidth: 420,
    width: '100%',
  },
  permIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  permDesc: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  error: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  errorFloat: {
    fontSize: 13,
    color: '#fff',
    textAlign: 'center',
    backgroundColor: 'rgba(255,59,48,0.9)',
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: spacing.xl,
    overflow: 'hidden',
  },
});
