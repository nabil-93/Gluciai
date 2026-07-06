import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui';
import { analyzeMealImage } from '@/services/ai';
import { setPendingScan } from '@/services/scanSession';
import { colors, radius, spacing, typography } from '@/theme';

export default function ScanScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const isWeb = Platform.OS === 'web';

  const analyze = async (base64: string, uri?: string) => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeMealImage(base64, i18n.language);
      if (!result) {
        // Never invent food — ask for a better picture.
        setError(
          "Nous n'avons pas pu identifier ce repas avec certitude. Reprenez une photo plus proche et bien éclairée."
        );
        setAnalyzing(false);
        return;
      }
      setPendingScan(result, uri);
      router.replace('/scan-result');
    } catch {
      setError(t('common.error'));
      setAnalyzing(false);
    }
  };

  const capture = async () => {
    if (!cameraRef.current || analyzing) return;
    const photo = await cameraRef.current.takePictureAsync({
      base64: true,
      quality: 0.6,
    });
    if (photo?.base64) {
      await analyze(photo.base64, photo.uri);
    }
  };

  const pickImage = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    const asset = picked.assets?.[0];
    if (asset?.base64) {
      await analyze(asset.base64, asset.uri);
    }
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Web (or no camera permission): elegant upload flow
  if (isWeb || (permission && !permission.granted)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Pressable onPress={close} style={[styles.closeButton, { top: insets.top + spacing.md }]}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>

        {analyzing ? (
          <AnalyzingOverlay label={t('scanner.analyzing')} />
        ) : (
          <View style={styles.uploadWrap}>
            <View style={styles.uploadIcon}>
              <Ionicons name="camera" size={40} color={colors.primary} />
            </View>
            <Text style={styles.uploadTitle}>{t('scanner.title')}</Text>
            <Text style={styles.uploadDesc}>
              {isWeb ? t('scanner.webUpload') : t('scanner.permissionDesc')}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!isWeb && permission && !permission.granted ? (
              <AppButton
                label={t('scanner.grantPermission')}
                onPress={requestPermission}
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
            <AppButton
              label={t('scanner.gallery')}
              onPress={pickImage}
              variant={!isWeb && permission && !permission.granted ? 'secondary' : 'primary'}
              style={{ alignSelf: 'stretch' }}
            />
          </View>
        )}
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
      />

      {/* Scan frame overlay */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.alignText}>{t('scanner.align')}</Text>
      </View>

      <Pressable onPress={close} style={[styles.closeButton, { top: insets.top + spacing.md }]}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>

      {analyzing ? (
        <AnalyzingOverlay label={t('scanner.analyzing')} />
      ) : (
        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.xl }]}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.controlsRow}>
            <Pressable onPress={pickImage} style={styles.sideButton}>
              <Ionicons name="images" size={22} color={colors.text} />
            </Pressable>
            <Pressable onPress={capture} style={styles.captureButton}>
              <View style={styles.captureInner} />
            </Pressable>
            <Pressable onPress={() => setTorch((v) => !v)} style={styles.sideButton}>
              <Ionicons
                name={torch ? 'flash' : 'flash-off'}
                size={22}
                color={torch ? colors.warning : colors.text}
              />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function AnalyzingOverlay({ label }: { label: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.analyzing]}>
      <View style={styles.analyzingCard}>
        <ActivityIndicator size="large" color={colors.ai} />
        <Text style={styles.analyzingText}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  frame: { width: 260, height: 260 },
  corner: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderColor: colors.primary,
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.lg },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.lg },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.lg },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.lg },
  alignText: {
    ...typography.caption,
    color: colors.text,
    backgroundColor: 'rgba(16,16,20,0.6)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(29,31,38,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.md,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  sideButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(29,31,38,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
  },
  analyzing: {
    backgroundColor: 'rgba(16,16,20,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingCard: {
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xxl,
  },
  analyzingText: { ...typography.bodyMedium, color: colors.ai },
  uploadWrap: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
    maxWidth: 420,
    width: '100%',
  },
  uploadIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: { ...typography.heading, textAlign: 'center' },
  uploadDesc: { ...typography.caption, textAlign: 'center', lineHeight: 20 },
  error: { ...typography.caption, color: colors.danger },
});
