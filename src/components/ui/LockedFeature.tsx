import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

function BigLock({ size = 34, color = '#b45309' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={11} width={18} height={11} rx={3} stroke={color} strokeWidth={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Full-screen state shown instead of a feature the admin dashboard has
 * blocked for this account (feature_access.allowed = false).
 */
export function LockedScreen({ featureLabel }: { featureLabel: string }) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 14 }]}>
      <View style={styles.headRow}>
        <Pressable onPress={close} style={styles.backBtn}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
      </View>

      <View style={styles.center}>
        <View style={styles.halo}>
          <View style={styles.haloInner}>
            <BigLock />
          </View>
        </View>
        <Text style={styles.title}>{t('locked.title')}</Text>
        <Text style={styles.feature}>{featureLabel}</Text>
        <Text style={styles.message}>{t('locked.message')}</Text>

        <View style={styles.noteBox}>
          <Text style={{ fontSize: 16 }}>💳</Text>
          <Text style={styles.noteText}>{t('locked.subscribeNote')}</Text>
        </View>

        <Pressable onPress={close} style={{ alignSelf: 'stretch', marginTop: 22 }}>
          <LinearGradient
            colors={['#2ec983', '#1fbc78']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{t('locked.understood')}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

/** Small padlock chip laid over a locked entry-point card. */
export function LockChip() {
  const { t } = useTranslation();
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>🔒 {t('locked.badge')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe', paddingHorizontal: 22 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  halo: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#fdf0d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  title: { fontFamily: F800, fontSize: 21, color: '#101a2b', marginTop: 18, textAlign: 'center' },
  feature: { fontFamily: F700, fontSize: 13.5, color: '#e8930c', marginTop: 5, textAlign: 'center' },
  message: {
    fontFamily: F500,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#5f6b7a',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 20,
    maxWidth: 340,
    ...shadows.card,
  },
  noteText: { flex: 1, fontFamily: F700, fontSize: 12.5, lineHeight: 18, color: '#2b3442' },
  cta: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1fbc78',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: { fontFamily: F700, fontSize: 15.5, color: '#ffffff' },
  chip: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#fdf0d8',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  chipText: { fontFamily: F700, fontSize: 9.5, color: '#b45309' },
});
