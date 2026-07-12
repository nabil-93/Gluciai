import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/* ────────────────────────────────────────────────────────────
 * WEB BARCODE SCANNER
 * Uses the browser's native BarcodeDetector (Chrome/Edge/Android
 * WebView) to read EAN/UPC codes straight from the camera — the
 * patient just points at the product, no typing. Falls back to
 * nothing (the parent still offers manual entry) when the API or
 * camera isn't available.
 * ──────────────────────────────────────────────────────────── */

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export const webBarcodeSupported =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  'BarcodeDetector' in window &&
  !!navigator.mediaDevices?.getUserMedia;

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
  const doneRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        // Some builds expose the class but support no formats — guard it.
        let formats = FORMATS;
        try {
          const supported: string[] = await Detector.getSupportedFormats?.();
          if (Array.isArray(supported) && supported.length) {
            formats = FORMATS.filter((f) => supported.includes(f));
            if (!formats.length) formats = supported;
          }
        } catch {
          /* keep defaults */
        }
        const detector = new Detector({ formats });

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

        const tick = async () => {
          if (cancelled || doneRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes?.find((c: any) => c.rawValue)?.rawValue;
            if (hit) {
              doneRef.current = true;
              onDetected(String(hit));
              return;
            }
          } catch {
            /* transient frame error — keep scanning */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        onError?.(t('barcode.cameraError'));
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
    playsInline: true,
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
