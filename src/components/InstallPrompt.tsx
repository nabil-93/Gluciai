import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path, Rect } from 'react-native-svg';

import { colors, radius, shadows, spacing } from '@/theme';

/* Web-only "install this app" banner:
 * - Android/desktop Chrome/Edge fire `beforeinstallprompt`, which we capture
 *   and replay from our own button (one real tap does the whole flow).
 * - iOS Safari has no such API at all (Apple never shipped it) — the only
 *   thing possible there is telling the user to use Share -> Add to Home
 *   Screen, so we show a short illustrated instruction instead.
 * Hidden once the app is already running standalone (installed). */

const DISMISS_KEY = 'glucoai.installPromptDismissedAt';
const DISMISS_DAYS = 14;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return true;
  const mql = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return !!mql || !!iosStandalone;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage?.getItem(DISMISS_KEY);
  if (!raw) return false;
  const elapsedDays = (Date.now() - Number(raw)) / (1000 * 60 * 60 * 24);
  return elapsedDays < DISMISS_DAYS;
}

function ShareGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M12 3v12M7 8l5-5 5 5"
        stroke={colors.primary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Rect x={4} y={13} width={16} height={8} rx={2} stroke={colors.primary} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || isStandalone() || wasRecentlyDismissed()) return;

    if (isIOS()) {
      setMode('ios');
      setVisible(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('android');
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setVisible(false);
    window.localStorage?.setItem(DISMISS_KEY, String(Date.now()));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible || Platform.OS !== 'web') return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>{t('install.title')}</Text>
        <Text style={styles.body}>
          {mode === 'ios' ? t('install.iosBody') : t('install.androidBody')}
        </Text>
        <View style={styles.actions}>
          {mode === 'android' ? (
            <Pressable onPress={install} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{t('install.installCta')}</Text>
            </Pressable>
          ) : (
            <View style={styles.iosStep}>
              <ShareGlyph />
              <Text style={styles.iosStepText}>{t('install.iosStep')}</Text>
            </View>
          )}
          <Pressable onPress={dismiss} hitSlop={8} style={styles.dismissBtn}>
            <Text style={styles.dismissText}>{t('install.notNow')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.floating,
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  actions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 13 },
  iosStep: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flex: 1 },
  iosStepText: { fontSize: 12.5, color: colors.text, flex: 1 },
  dismissBtn: { paddingVertical: 8, paddingHorizontal: spacing.sm },
  dismissText: { fontSize: 13, color: colors.textTertiary, fontWeight: '600' },
});
