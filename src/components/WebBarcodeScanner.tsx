import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
} from '@zxing/library';

/* ────────────────────────────────────────────────────────────
 * WEB BARCODE SCANNER
 * Reads EAN/UPC codes straight from the camera on the web. Uses the
 * browser's native BarcodeDetector when available (Chrome/Edge/
 * Android — fastest), and otherwise falls back to ZXing, a pure-JS
 * decoder that works EVERYWHERE, including Safari on iPhone and
 * Firefox. So the camera option shows on every browser that has a
 * camera; typing is only ever a manual fallback.
 * ──────────────────────────────────────────────────────────── */

// Supported as long as the browser can open a camera — ZXing covers the rest.
export const webBarcodeSupported =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

const hasNativeDetector =
  typeof window !== 'undefined' && 'BarcodeDetector' in window;

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export function WebBarcodeScanner({
  onDetected,
  onError,
}: {
  onDetected: (code: string) => void;
  onError?: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingRef = useRef<BrowserMultiFormatReader | null>(null);
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const emit = (code: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDetected(code);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play().catch(() => {});
        setReady(true);

        // ── Path A: native BarcodeDetector (fast) ──
        if (hasNativeDetector) {
          try {
            const Detector = (window as any).BarcodeDetector;
            let formats = NATIVE_FORMATS;
            try {
              const supported: string[] = await Detector.getSupportedFormats?.();
              if (Array.isArray(supported) && supported.length) {
                const f = NATIVE_FORMATS.filter((x) => supported.includes(x));
                formats = f.length ? f : supported;
              }
            } catch {
              /* defaults */
            }
            const detector = new Detector({ formats });
            const tick = async () => {
              if (cancelled || doneRef.current || !videoRef.current) return;
              try {
                const codes = await detector.detect(videoRef.current);
                const hit = codes?.find((c: any) => c.rawValue)?.rawValue;
                if (hit) return emit(String(hit));
              } catch {
                /* transient */
              }
              rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
            return;
          } catch {
            /* fall through to ZXing */
          }
        }

        // ── Path B: ZXing (works on every browser) ──
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ]);
        const reader = new BrowserMultiFormatReader(hints, 300);
        zxingRef.current = reader;
        reader.decodeFromStream(stream, video, (result) => {
          if (result && !doneRef.current) emit(result.getText());
        }).catch(() => {
          /* decode loop stopped on cleanup */
        });
      } catch {
        onError?.(t('barcode.cameraError'));
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        zxingRef.current?.reset();
      } catch {}
      zxingRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // <video> is a real DOM element on react-native-web; create it via
  // React.createElement so the RN type checker doesn't reject the tag.
  const videoEl = React.createElement('video', {
    ref: videoRef,
    muted: true,
    autoPlay: true,
    playsInline: true,
    // Safari on iOS only honours inline playback with these lowercase attrs.
    'webkit-playsinline': 'true',
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      position: 'absolute',
    },
  });

  return (
    <View style={styles.wrap}>
      {videoEl}
      <View style={styles.frame} />
      <Text style={styles.hint}>
        {ready ? t('barcode.aim') : t('barcode.starting')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 260,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#101014',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 220,
    height: 120,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  hint: {
    position: 'absolute',
    bottom: 14,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
