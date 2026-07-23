import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { UsageFeature } from '@/types';
import { SUPPORT_WHATSAPP as SUPPORT_WA } from '@/config/support';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Support WhatsApp — where a locked-out patient asks to unlock a feature. */
const SUPPORT_WA_DISPLAY = '+49 163 7606478';

function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z"
        fill="#ffffff"
      />
      <Path
        d="M8.5 7.3c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3l-1.6-.8c-.2-.1-.4-.1-.6.1l-.6.8c-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3 0-.4l-.5-1.4Z"
        fill="#1fbc78"
      />
    </Svg>
  );
}

function openSupportWhatsApp(message: string) {
  const encoded = encodeURIComponent(message);
  const wa = `whatsapp://send?phone=${SUPPORT_WA}&text=${encoded}`;
  const web = `https://wa.me/${SUPPORT_WA}?text=${encoded}`;
  // Try the app first; fall back to the browser link.
  Linking.openURL(wa).catch(() => Linking.openURL(web).catch(() => {}));
}

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
 * blocked for this account (feature_access.allowed = false), or — with
 * variant="quota" — when a monthly usage budget (e.g. call minutes) is spent.
 */
export function LockedScreen({
  featureLabel,
  variant = 'locked',
  quotaFeature,
}: {
  featureLabel: string;
  variant?: 'locked' | 'quota' | 'plan';
  /** For variant="quota": which feature, so the message names the right
   *  period (today / this week / this month) from the cached usage status. */
  quotaFeature?: UsageFeature;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const isQuota = variant === 'quota';
  const isPlan = variant === 'plan';
  const period = useAppStore((s) =>
    quotaFeature
      ? s.usage.find((u) => u.feature === quotaFeature)?.period ?? 'day'
      : 'day'
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const title = isQuota
    ? t('locked.quotaTitle')
    : isPlan
      ? t('locked.planTitle')
      : t('locked.title');
  const message = isQuota
    ? t('locked.quotaMessage', { period: t(`locked.period_${period}`) })
    : isPlan
      ? t('locked.planMessage')
      : t('locked.message');

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
        <View style={[styles.halo, isPlan && { backgroundColor: '#e9fbf2' }]}>
          <View style={styles.haloInner}>
            {isPlan ? <Text style={{ fontSize: 30 }}>⭐</Text> : <BigLock />}
          </View>
        </View>
        <Text style={styles.title}>{title}</Text>
        {featureLabel ? <Text style={styles.feature}>{featureLabel}</Text> : null}
        <Text style={styles.message}>{message}</Text>

        <View style={styles.noteBox}>
          <Text style={{ fontSize: 16 }}>{isQuota ? '⏳' : isPlan ? '✨' : '💳'}</Text>
          <Text style={styles.noteText}>
            {isQuota
              ? t('locked.quotaNote', { reset: t(`locked.reset_${period}`) })
              : isPlan
                ? t('locked.planNote')
                : t('locked.subscribeNote')}
          </Text>
        </View>

        {/* Contact support on WhatsApp — to unlock a feature, or (quota) to ask
            for a higher limit instead of waiting for the period to reset. */}
        <Pressable
          onPress={() =>
            openSupportWhatsApp(
              t(isQuota ? 'locked.waQuotaMessage' : 'locked.waMessage', {
                feature: featureLabel,
              })
            )
          }
          style={{ alignSelf: 'stretch', marginTop: 22 }}
        >
          <LinearGradient
            colors={['#25D366', '#1ebe5d']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cta}
          >
            <WhatsAppIcon />
            <Text style={styles.ctaText}>
              {t(isQuota ? 'locked.contactWaQuota' : 'locked.contactWa')}
            </Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.waNumber}>{SUPPORT_WA_DISPLAY}</Text>

        <Pressable onPress={close} style={{ marginTop: isQuota ? 22 : 14 }}>
          <Text style={styles.secondaryText}>{t('locked.understood')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Small padlock chip laid over a locked entry-point card (icon only). */
export function LockChip() {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>🔒</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#25D366',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaText: { fontFamily: F700, fontSize: 15.5, color: '#ffffff' },
  waNumber: {
    fontFamily: F700,
    fontSize: 13,
    color: '#5f6b7a',
    marginTop: 10,
    letterSpacing: 0.3,
  },
  secondaryText: { fontFamily: F700, fontSize: 14, color: '#98a1af' },
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
