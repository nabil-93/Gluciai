import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Spinner } from '@/components/ui/Spinner';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, LockedScreen, ProgressRing } from '@/components/ui';
import { isDemoMode, supabase } from '@/lib/supabase';
import { analyzeMealImage, type ScanStage } from '@/services/ai';
import { setPendingScan } from '@/services/scanSession';
import { isFeatureExhausted } from '@/services/usage';
import { useAppStore } from '@/store/useAppStore';

/* ── Palette taken 1:1 from the Claude-Design "Scanner Repas" reference ── */
const BG = '#0B110E';
const ACCENT = '#37DE73';
const ACCENT_LIGHT = '#B4FFD0';
const PROGRESS = '#8A78F0';
const GRID_LINE = 'rgba(130,235,170,0.06)';

/* ── Viewfinder geometry ───────────────────────────────────────────────────
 * The camera hands us a 4:3 still (the default on AVCapturePhotoOutput and on
 * CameraX's ImageCapture alike). The preview layer, though, scales that frame
 * to FILL whatever view it is given and throws away the overflow — iOS uses
 * resizeAspectFill, Android FILL_CENTER. Hand it a full-screen box on a 19.5:9
 * phone and it must blow the frame up ~1.6× to cover the height, hiding about
 * 40 % of the WIDTH: the viewfinder looks zoomed in, while takePictureAsync
 * still returns the whole wide frame. You aim at one thing and photograph
 * another — fatal for a plate of food you are about to dose insulin against.
 *
 * So the preview gets a box of the sensor's own shape. Nothing is cropped:
 * what you frame is exactly what is captured and sent to the vision model.
 *
 * 4:3 is only the OPENING GUESS, though. On the web build the browser alone
 * decides the stream's shape — expo-camera asks getUserMedia for nothing but a
 * facingMode — and it hands back 4:3 on one phone and 16:9 on the next, while
 * the <video> is styled `object-fit: cover` and the capture path draws the
 * FULL videoWidth × videoHeight to a canvas. Guess wrong there and the crop is
 * back. So the guess is replaced by the frame's real shape as soon as the
 * stream (or the first photo) can tell us what it is. */
const PREVIEW_ASPECT = 3 / 4; // width ÷ height, portrait — starting assumption only
/* Breathing room between the live image and the corner brackets. Tuned so the
 * bracketed area comes out at ~3:4 itself — the brackets then read as a true
 * viewfinder — and so the top pair clears the subtitle that floats above it. */
const FRAME_INSET_X = 22;
const FRAME_INSET_Y = 30;
/* How far each scrim is allowed to bleed from its letterbox band onto the
 * live image — just enough to carry the text above it. */
const SCRIM_FADE = 64;
/* Space the controls dock needs at the bottom (70pt shutter + padding). */
const DOCK_RESERVE = 118;

/* Blocked from the admin dashboard, or the daily/weekly/monthly scan quota
 * spent? Show the lock instead of the camera. The quota is also enforced
 * server-side (analyze-meal), so this pre-check is just faster UX. */
export default function ScanScreenGate() {
  const locked = useAppStore((s) => s.lockedFeatures.includes('scanner'));
  const { t } = useTranslation();
  const [quota, setQuota] = useState<'checking' | 'ok' | 'exceeded'>('checking');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isDemoMode || !supabase) {
        if (alive) setQuota('ok');
        return;
      }
      try {
        const exhausted = await isFeatureExhausted('scanner');
        if (alive) setQuota(exhausted ? 'exceeded' : 'ok');
      } catch {
        if (alive) setQuota('ok'); // never block on a transient error
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (locked) return <LockedScreen featureLabel={t('locked.featScanner')} />;
  if (quota === 'exceeded')
    return (
      <LockedScreen featureLabel={t('locked.featScanner')} variant="quota" quotaFeature="scanner" />
    );
  if (quota === 'checking') return <View style={{ flex: 1, backgroundColor: BG }} />;
  return <ScanScreen />;
}

/** Progress climbs toward these ceilings per pipeline stage; it never hits
 *  100% until the real result lands, then snaps up and routes to the result. */
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
  const { width: winW, height: winH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  // Flash cycles off → auto → on. "on" = continuous torch (works on Android
  // web via track constraint; iOS browsers have no torch API). "auto" lets
  // the native camera decide at capture time.
  const [flash, setFlash] = useState<'off' | 'auto' | 'on'>('off');
  const [analyzing, setAnalyzing] = useState(false);
  const [percent, setPercent] = useState(0);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camError, setCamError] = useState(false);
  const [boxH, setBoxH] = useState(0);
  /* Real shape of the camera frame, w ÷ h, portrait. Starts as the 4:3 guess
   * and is corrected the moment the stream or a capture reveals the truth. */
  const [frameAspect, setFrameAspect] = useState(PREVIEW_ASPECT);
  const cameraRef = useRef<CameraView>(null);
  const previewWrapRef = useRef<View>(null);

  // Refs the percent-climb interval reads without re-subscribing.
  const stageRef = useRef<ScanStage>('detecting');
  const finishedRef = useRef(false);
  const routedRef = useRef(false);

  const isWeb = Platform.OS === 'web';
  // Web live preview needs getUserMedia (secure context / camera-capable browser).
  const webCamSupported =
    isWeb && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  // Web: fire the browser's camera prompt on arrival so the live feed fills
  // the backdrop without an extra tap (no themed permission screen on web).
  const askedWebRef = useRef(false);
  useEffect(() => {
    if (!webCamSupported || askedWebRef.current) return;
    if (permission && !permission.granted && permission.canAskAgain) {
      askedWebRef.current = true;
      requestPermission();
    }
  }, [webCamSupported, permission, requestPermission]);

  /* ── Laser sweep inside the scan box (up ↔ down, 3.6s round trip) ──
   * Only while the analysis runs. Sweeping a green line and a grid across a
   * LIVE preview is what made the food look hazier here than in the phone's
   * camera; during framing the image is now left untouched. */
  const laser = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (boxH <= 0 || !analyzing) return;
    laser.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(laser, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(laser, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [analyzing, boxH, laser]);
  const laserY = laser.interpolate({
    inputRange: [0, 1],
    outputRange: [4, Math.max(4, boxH - 6)],
  });

  /* ── Pulsing "live" dot on the flash button ── */
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  /* ── Percent driver: climbs to the current stage ceiling, then to 100 ── */
  useEffect(() => {
    if (!analyzing) return;
    const id = setInterval(() => {
      setPercent((p) => {
        const ceil = finishedRef.current ? 100 : STAGE_CEILING[stageRef.current] ?? 90;
        if (p >= ceil) {
          if (finishedRef.current && p >= 100 && !routedRef.current) {
            routedRef.current = true;
            clearInterval(id);
            setTimeout(() => router.replace('/scan-result'), 300);
          }
          return p;
        }
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
    // Web capture APIs sometimes hand back a full data URI — the vision
    // endpoint wants bare base64.
    base64 = base64.replace(/^data:image\/[^;]+;base64,/, '');
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
      // Distinguish a temporary AI rate-limit (quota) from other failures.
      const msg = String((e as Error)?.message ?? e);
      const rateLimited = /429|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(msg);
      setError(rateLimited ? t('scanner.rateLimited') : t('scanner.scanFailed'));
      setAnalyzing(false);
      setCaptured(null);
    }
  };

  /**
   * Normalize any captured/picked image before sending it to the vision
   * model: resize to 1024px wide (ratio preserved), re-encode JPEG 0.8, so
   * the model always gets the FULL frame at a consistent, detail-rich size.
   * Returns the base64 plus the exact sent dimensions — the reference frame
   * for the bounding boxes Gemini sends back.
   */
  const prepareImage = async (
    uri: string
  ): Promise<{ base64: string; width: number; height: number } | null> => {
    try {
      const ctx = ImageManipulator.manipulate(uri);
      ctx.resize({ width: 1024 }); // height omitted → ratio preserved
      const ref = await ctx.renderAsync();
      const out = await ref.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
      if (!out.base64) return null;
      console.log(
        `[scan] sending ${out.width}x${out.height} JPEG, ~${Math.round(out.base64.length / 1024)}KB (b64)`
      );
      return { base64: out.base64, width: out.width, height: out.height };
    } catch (e) {
      console.warn('[scan] prepareImage failed, falling back to raw picker image', e);
      return null;
    }
  };

  // Freeze the shot on screen, then run it through prepare + analyze.
  const runOn = async (uri: string, rawBase64?: string) => {
    setCaptured(uri);
    const prepared = await prepareImage(uri);
    if (prepared) {
      await analyze(prepared.base64, uri, { width: prepared.width, height: prepared.height });
    } else if (rawBase64) {
      await analyze(rawBase64, uri);
    }
  };

  // Native live camera → snap a frame.
  const capture = async () => {
    if (!cameraRef.current || analyzing) return;
    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 1 });
    if (!photo?.uri) return;
    // The photo is the ground truth about the frame's shape — if the preview
    // box guessed wrong, the next one is already right.
    applyAspect(photo.width, photo.height, true);
    await runOn(photo.uri, photo.base64);
  };

  // Fallback when no live preview is possible (permission denied, mount
  // error, no getUserMedia): open the OS camera directly; fall back to the
  // library if the camera capture isn't available on this platform.
  const captureViaSystem = async () => {
    if (analyzing) return;
    try {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 1 });
      const asset = shot.assets?.[0];
      if (asset?.uri) {
        await runOn(asset.uri, asset.base64 ?? undefined);
        return;
      }
      if (!shot.canceled) await pickImage();
    } catch {
      await pickImage();
    }
  };

  const pickImage = async () => {
    if (analyzing) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 1 });
    const asset = picked.assets?.[0];
    if (!asset?.uri) return;
    await runOn(asset.uri, asset.base64 ?? undefined);
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Live full-bleed camera on native AND web once granted; if the preview
  // can't mount (denied, no getUserMedia, mount error) the dark scanner
  // design stands in and capture goes through the OS camera / gallery.
  const liveCamera = !camError && !!permission?.granted && (!isWeb || webCamSupported);

  /**
   * Record the frame's real shape. `forcePortrait` is for native stills, whose
   * width/height come back in sensor orientation (4032×3024 for a photo taken
   * upright); the app is portrait-locked, so the frame is always the taller of
   * the two. Web reports the <video>'s own intrinsic size, already rotated for
   * the device, so there it is taken as-is. Absurd values are ignored rather
   * than allowed to reshape the viewfinder.
   */
  const applyAspect = useCallback(
    (w?: number | null, h?: number | null, forcePortrait = false) => {
      if (!w || !h) return;
      const a = forcePortrait ? Math.min(w, h) / Math.max(w, h) : w / h;
      if (Number.isFinite(a) && a >= 0.3 && a <= 3) setFrameAspect(a);
    },
    []
  );

  /* Web: expo-camera renders a plain <video> styled `object-fit: cover`, and
   * the browser picks the stream size on its own — so unless this box matches
   * the stream exactly, the crop is straight back. The only place that size
   * exists is the element itself. */
  useEffect(() => {
    if (!isWeb || !liveCamera) return;

    let video: HTMLVideoElement | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => applyAspect(video?.videoWidth, video?.videoHeight);

    const attach = () => {
      const root = previewWrapRef.current as unknown as HTMLElement | null;
      video = root?.querySelector?.('video') ?? null;
      if (!video) {
        // The element appears a tick after the stream is granted.
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
  }, [isWeb, liveCamera, applyAspect]);

  /* Largest sensor-shaped box that fits the screen, centred — a "contain"
   * viewfinder rather than a "cover" one. The dark bands it leaves above and
   * below fall under the scrims, where the title and the dock already live. */
  const previewW = Math.min(winW, winH * frameAspect);
  const previewH = previewW / frameAspect;
  const previewLeft = (winW - previewW) / 2;
  const previewTop = (winH - previewH) / 2;
  // A wide stream leaves a short preview; the brackets shrink with it instead
  // of inverting the box.
  const insetX = Math.min(FRAME_INSET_X, previewW * 0.12);
  const insetY = Math.min(FRAME_INSET_Y, previewH * 0.12);

  /* The corner brackets are pinned to the live image, so they now mark the
   * true edges of the shot instead of floating over a cropped one. */
  const frameTop = previewTop + insetY;
  /* On a short screen the sensor frame is taller than the gap between the
   * subtitle and the dock. The preview still shows all of it — only the guide
   * brackets give way, rather than being drawn across the shutter button. */
  const frameBottomLimit = winH - insets.bottom - DOCK_RESERVE;
  const frameRect = {
    left: previewLeft + insetX,
    top: frameTop,
    width: Math.max(0, previewW - insetX * 2),
    height: Math.max(0, Math.min(previewH - insetY * 2, frameBottomLimit - frameTop)),
  };

  /* The scrims exist to keep the top bar, the title and the dock readable —
   * not to tint the food. They used to run 46 % + 54 % of the screen, i.e.
   * a veil over every pixel of the preview, which is most of why the image
   * looked duller here than in the phone's own camera. Now each one covers
   * its letterbox band plus a short fade onto the image, and the middle of
   * the frame is left completely alone. */
  const topBand = previewTop;
  const bottomBand = Math.max(0, winH - previewTop - previewH);
  const scrimTopH = topBand + SCRIM_FADE;
  const scrimBottomH = bottomBand + SCRIM_FADE;
  const clampStop = (v: number) => Math.min(0.94, Math.max(0.06, v));
  const topFadeStop = clampStop(topBand / Math.max(1, scrimTopH));
  const bottomFadeStop = clampStop(SCRIM_FADE / Math.max(1, scrimBottomH));

  /* ── Native: waiting on permission state ── */
  if (!isWeb && !permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Spinner size={26} color={ACCENT} />
      </View>
    );
  }

  /* ── Native: permission not granted → dark themed prompt ── */
  if (!isWeb && !permission?.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Pressable onPress={close} style={[styles.circleBtn, styles.closeAbs, { top: insets.top + 16 }]}>
          <Ionicons name="close" size={20} color="#E8ECEA" />
        </Pressable>
        <View style={styles.permWrap}>
          <View style={styles.permIcon}>
            <Ionicons name="camera" size={38} color={ACCENT} />
          </View>
          <Text style={styles.permTitle}>{t('scanner.title')}</Text>
          <Text style={styles.permDesc}>
            {isWeb ? t('scanner.webUpload') : t('scanner.permissionDesc')}
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {!isWeb ? (
            <AppButton label={t('scanner.grantPermission')} onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
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
      {/* Live camera, sized to the sensor's own frame so the preview shows the
          whole shot instead of a blown-up crop of it. The frozen capture lives
          INSIDE the scan box. Dark backdrop when there is no preview. */}
      <View ref={previewWrapRef} style={styles.previewLayer} pointerEvents="none">
        {liveCamera ? (
          /* The size has to live on a plain View, not on CameraView: the
           * component puts `flex: 1` on its own root, and inside a column
           * flex parent that flex-grow beats any height passed in — the box
           * silently stretched back to the full screen and the crop with it.
           * A fixed-size parent with the camera absolutely filling it cannot
           * be overridden that way. */
          <View style={{ width: previewW, height: previewH, overflow: 'hidden' }}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
            // Android: switches the native preview's scaleType from FILL to
            // FIT, so the layer itself stops cropping too. iOS ignores it and
            // is handled by the box above being the sensor's own shape.
              ratio="4:3"
              enableTorch={flash === 'on'}
              flash={flash === 'auto' ? 'auto' : 'off'}
              onMountError={() => setCamError(true)}
            />
          </View>
        ) : null}
      </View>

      {/* Scrims: each covers its letterbox band and fades out just past the
          edge of the image, so the chrome stays readable and the food does
          not sit under a veil. */}
      <LinearGradient
        colors={['rgba(8,13,11,0.96)', 'rgba(8,13,11,0.58)', 'rgba(8,13,11,0)']}
        locations={[0, topFadeStop, 1]}
        style={[styles.scrimTop, { height: scrimTopH }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(7,11,9,0)', 'rgba(7,11,9,0.66)', 'rgba(7,11,9,0.96)']}
        locations={[0, bottomFadeStop, 1]}
        style={[styles.scrimBottom, { height: scrimBottomH }]}
        pointerEvents="none"
      />

      {/* Content column */}
      <View
        style={[styles.column, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 14 }]}
        pointerEvents="box-none"
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar} pointerEvents="box-none">
          <Pressable onPress={close}>
            <Glass style={styles.circleBtn} radius={22}>
              <Ionicons name="close" size={18} color="#E8ECEA" />
            </Glass>
          </Pressable>

          <Glass style={styles.pill} radius={999}>
            <Ionicons name="sparkles" size={14} color={ACCENT} style={styles.sparkGlow} />
            <Text style={styles.pillText}>
              <Text style={styles.pillStrong}>IA</Text> {t('scanner.realtime')}
            </Text>
          </Glass>

          <Pressable
            onPress={() => setFlash((m) => (m === 'off' ? 'auto' : m === 'auto' ? 'on' : 'off'))}
          >
            <Glass
              style={styles.circleBtn}
              radius={22}
              tint={flash === 'on' ? 'rgba(55,222,115,0.22)' : undefined}
            >
              <Ionicons
                name={flash === 'off' ? 'flash-off-outline' : flash === 'auto' ? 'flash-outline' : 'flash'}
                size={18}
                color={flash === 'on' ? ACCENT : '#E8ECEA'}
              />
              {flash === 'auto' ? <Text style={styles.flashAuto}>A</Text> : null}
              <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
            </Glass>
          </Pressable>
        </View>

        {/* ── Title ── */}
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={styles.title}>
            {t('scanner.heroTitle')} <Text style={styles.titleAccent}>{t('scanner.heroAccent')}</Text>
          </Text>
          <Text style={styles.subtitle}>{t('scanner.heroSubtitle')} ✨</Text>
        </View>

        {/* Spacer: the frame itself is pinned to the live image, below. */}
        <View style={styles.scanArea} pointerEvents="none" />

        {error ? <Text style={styles.errorFloat}>{error}</Text> : null}

        {/* ── Controls dock ── */}
        <Glass style={styles.dock} radius={26} tint="rgba(12,18,15,0.62)">
          <DockButton icon="images-outline" label={t('scanner.gallery')} onPress={pickImage} disabled={analyzing} />
          <Pressable onPress={liveCamera ? capture : captureViaSystem} disabled={analyzing} style={styles.shutter}>
            <View style={styles.shutterCore} />
          </Pressable>
          <DockButton
            icon="sync-outline"
            label={t('scanner.flip')}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
            disabled={analyzing}
          />
        </Glass>

        {/* ── White analysis card (scanning only) ── */}
        {analyzing ? <AnalyzingCard percent={percent} uri={captured} t={t} /> : null}
      </View>

      {/* ── Scan frame: grid + laser + corners + checklist, laid exactly over
          the camera frame, so the brackets mark what will really be shot ── */}
      <View style={[styles.scanFrame, frameRect]} pointerEvents="none">
        <View style={styles.gridBox} onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
          {/* Frozen shot pinned inside the box; grid + laser sweep on top of it
              while the analysis runs. Contained, not cropped: this is the exact
              frame the vision model is reading. */}
          {captured ? (
            <Image
              source={{ uri: captured }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={120}
            />
          ) : null}
          {/* Analysis effects only — never over the live image. */}
          {analyzing ? (
            <>
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
                <Defs>
                  <Pattern id="grid" width={38} height={38} patternUnits="userSpaceOnUse">
                    <Path d="M 38 0 L 0 0 0 38" fill="none" stroke={GRID_LINE} strokeWidth={1} />
                  </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#grid)" />
              </Svg>
              <Animated.View style={[styles.laser, { transform: [{ translateY: laserY }] }]}>
                <LinearGradient
                  colors={['transparent', ACCENT, ACCENT_LIGHT, ACCENT, 'transparent']}
                  locations={[0, 0.18, 0.5, 0.82, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.laserLine}
                />
              </Animated.View>
            </>
          ) : null}
        </View>

        {/* Corner brackets */}
        <View style={[styles.corner, styles.cTL]} />
        <View style={[styles.corner, styles.cTR]} />
        <View style={[styles.corner, styles.cBL]} />
        <View style={[styles.corner, styles.cBR]} />

        {/* Checklist (idle only) */}
        {!analyzing ? (
          <View style={styles.checklistWrap}>
            <Glass style={styles.checklist} radius={16} tint="rgba(13,19,16,0.72)">
              <View style={styles.checklistHead}>
                <Ionicons name="restaurant-outline" size={14} color={ACCENT} />
                <Text style={styles.checklistTitle}>{t('scanner.checklistTitle')}</Text>
              </View>
              <CheckRow label={t('scanner.check1')} />
              <CheckRow label={t('scanner.check2')} />
              <CheckRow label={t('scanner.check3')} />
            </Glass>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ─────────────────────────── Subcomponents ─────────────────────────── */

/** Frosted-glass surface: blur + colored tint + hairline border. */
function Glass({
  children,
  style,
  radius,
  tint = 'rgba(9,15,12,0.55)',
  intensity = 18,
}: {
  children?: React.ReactNode;
  style?: any;
  radius: number;
  tint?: string;
  intensity?: number;
}) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' }, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      {children}
    </View>
  );
}

function CheckRow({ label }: { label: string }) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkDot}>
        <Ionicons name="checkmark" size={11} color="#08140D" />
      </View>
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

function DockButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.dockBtn}>
      <View style={styles.dockTile}>
        <Ionicons name={icon} size={22} color="#E4E9E6" />
      </View>
      <Text style={styles.dockLabel}>{label}</Text>
    </Pressable>
  );
}

/** White status card with thumbnail (purple corner ticks) + live % ring. */
function AnalyzingCard({
  percent,
  uri,
  t,
}: {
  percent: number;
  uri: string | null;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.analyzeCard}>
      <View style={styles.thumb}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[styles.thumbTick, styles.thumbTickTL]} />
        <View style={[styles.thumbTick, styles.thumbTickBR]} />
      </View>
      <View style={styles.analyzeText}>
        <Text style={styles.analyzeTitle}>
          {t('scanner.analyzingCard')}
        </Text>
        <Text style={styles.analyzeSub} numberOfLines={2}>
          {t('scanner.analyzingCardSub')} ✨
        </Text>
      </View>
      <ProgressRing
        size={56}
        strokeWidth={6}
        progress={percent / 100}
        color={PROGRESS}
        trackColor="#ECE9FB"
        valueText={`${percent}%`}
        valueColor={PROGRESS}
        valueSize={13}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // Centres the sensor-shaped preview; the bands it leaves are the app's own
  // background, so the letterbox reads as part of the dark scanner chrome.
  previewLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },

  scrimTop: { position: 'absolute', top: 0, left: 0, right: 0 },
  scrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },

  column: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },

  // ── Top bar ──
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  circleBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeAbs: { position: 'absolute', left: 16, zIndex: 10, borderRadius: 22, backgroundColor: 'rgba(9,15,12,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, height: 40, justifyContent: 'center' },
  pillText: { fontSize: 13, fontWeight: '500', color: '#D6DCD9' },
  pillStrong: { fontWeight: '800', color: '#fff' },
  sparkGlow: {
    textShadowColor: 'rgba(55,222,115,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  flashAuto: {
    position: 'absolute',
    bottom: 7,
    right: 8,
    fontSize: 9,
    fontWeight: '800',
    color: ACCENT,
  },
  liveDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    borderWidth: 2,
    borderColor: BG,
  },

  // ── Title ──
  titleWrap: { alignItems: 'center', marginTop: 14, paddingHorizontal: 10 },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 20,
  },
  titleAccent: { color: ACCENT },
  subtitle: {
    marginTop: 9,
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 20,
    color: '#B4BEB8',
    textAlign: 'center',
  },

  // ── Scan area ──
  // Layout spacer only: it holds the dock down while the frame below is
  // positioned against the camera frame rather than against this column.
  scanArea: { flex: 1, minHeight: 210, marginTop: 12 },
  scanFrame: { position: 'absolute' },
  gridBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    overflow: 'hidden',
  },
  laser: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  laserLine: {
    height: 2,
    borderRadius: 2,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 9,
    elevation: 6,
  },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: ACCENT },
  cTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 16 },
  cTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 16 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 16 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 16 },

  checklistWrap: { position: 'absolute', left: 0, right: 0, bottom: 22, alignItems: 'center' },
  checklist: { width: 250, paddingVertical: 13, paddingHorizontal: 15 },
  checklistHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
  checklistTitle: { fontSize: 12.5, fontWeight: '600', color: '#DCE2DF' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 },
  checkDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontSize: 12.5, fontWeight: '500', color: '#C6CEC9' },

  errorFloat: {
    fontSize: 12.5,
    color: '#fff',
    textAlign: 'center',
    backgroundColor: 'rgba(255,59,48,0.9)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 24,
    marginBottom: 8,
    overflow: 'hidden',
  },

  // ── Controls dock ──
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 30,
  },
  dockBtn: { alignItems: 'center', gap: 6, width: 60 },
  dockTile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockLabel: { fontSize: 11, fontWeight: '500', color: '#AEB8B2' },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  shutterCore: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  // ── White analysis card ──
  analyzeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 11,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.42,
    shadowRadius: 36,
    elevation: 16,
  },
  thumb: { width: 56, height: 56, borderRadius: 13, overflow: 'hidden', backgroundColor: '#EFEFF4' },
  thumbTick: { position: 'absolute', width: 11, height: 11, borderColor: PROGRESS },
  thumbTickTL: { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  thumbTickBR: { bottom: 4, right: 4, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
  analyzeText: { flex: 1, minWidth: 0 },
  analyzeTitle: { fontSize: 14, fontWeight: '800', color: '#16201A', letterSpacing: -0.1 },
  analyzeSub: { marginTop: 3, fontSize: 11, fontWeight: '500', lineHeight: 15, color: '#7C8783' },

  // ── Permission / fallback ──
  permWrap: { alignItems: 'center', gap: 16, paddingHorizontal: 32, maxWidth: 420, width: '100%' },
  permIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(55,222,115,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
  permDesc: { fontSize: 14, lineHeight: 20, color: '#B4BEB8', textAlign: 'center' },
  error: { fontSize: 13, color: '#FF6B6B', textAlign: 'center' },
});
