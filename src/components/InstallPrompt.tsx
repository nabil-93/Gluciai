import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

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

function DownloadGlyph() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24">
      <Path
        d="M12 3v11M7 10l5 5 5-5"
        stroke="#fff"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M5 19h14" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function CloseGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M5 5l14 14M19 5L5 19" stroke={colors.textTertiary} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function MoreDotsGlyph({ color = colors.primary, size = 15 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2.2} fill={color} />
      <Circle cx={12} cy={12} r={2.2} fill={color} />
      <Circle cx={19} cy={12} r={2.2} fill={color} />
    </Svg>
  );
}

/* Mimics Safari's real toolbar (the row around the address bar) so the user
 * can match it to what they actually see. Modern Safari tucks Share behind
 * the "•••" (More) button rather than showing it directly, so that's what
 * gets ringed here, with an arrow pointing at it — on iPhone that toolbar
 * sits right below this dialog, at the very bottom of the screen. */
function SafariToolbarHint() {
  return (
    <View style={styles.toolbarHint}>
      <View style={styles.toolbarBar}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M15 5l-7 7 7 7" stroke={colors.textTertiary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
        <View style={styles.toolbarAddress} />
        <View style={styles.toolbarShareRing}>
          <MoreDotsGlyph color={colors.primary} size={15} />
        </View>
      </View>
      <Svg width={14} height={10} viewBox="0 0 14 10" style={styles.toolbarArrow}>
        <Path d="M1 1l6 6 6-6" stroke={colors.primary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </View>
  );
}

export function InstallPrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Registering the SW is what makes Chrome actually finish the "Add to
    // Home screen" install (not just show the prompt) — without it the
    // native dialog can appear and be accepted, yet no icon gets created.
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

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
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
          <CloseGlyph />
        </Pressable>

        <LinearGradient
          colors={[colors.primary, colors.inkStrong]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <DownloadGlyph />
        </LinearGradient>

        <Text style={styles.title}>{t('install.title')}</Text>
        <Text style={styles.body}>
          {mode === 'ios' ? t('install.iosBody') : t('install.androidBody')}
        </Text>

        {mode === 'ios' ? <SafariToolbarHint /> : null}

        {mode === 'android' ? (
          <Pressable onPress={install} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>{t('install.installCta')}</Text>
          </Pressable>
        ) : (
          <View style={styles.iosStepBox}>
            <View style={styles.iosStepRow}>
              <Text style={styles.iosStepNumber}>1</Text>
              <Text style={styles.iosStepText}>{t('install.iosStep1')}</Text>
            </View>
            <View style={styles.iosStepRow}>
              <Text style={styles.iosStepNumber}>2</Text>
              <Text style={styles.iosStepText}>{t('install.iosStep2')}</Text>
            </View>
          </View>
        )}

        <Pressable onPress={dismiss} hitSlop={8} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>{t('install.notNow')}</Text>
        </Pressable>
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
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(10,20,16,0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: colors.primaryDim,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.floating,
  },
  closeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    ...shadows.card,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19, textAlign: 'center' },
  primaryBtn: {
    marginTop: spacing.xs,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadows.card,
  },
  primaryBtnText: { color: colors.textOnPrimary, fontWeight: '700', fontSize: 15 },
  iosStepBox: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  iosStepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iosStepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryDim,
    color: colors.inkStrong,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
    overflow: 'hidden',
  },
  iosStepText: { flex: 1, fontSize: 12.5, color: colors.text, fontWeight: '600' },
  dismissBtn: { marginTop: spacing.xs, paddingVertical: 6, paddingHorizontal: spacing.sm },
  dismissText: { fontSize: 13, color: colors.textTertiary, fontWeight: '600' },

  toolbarHint: { alignItems: 'center', alignSelf: 'stretch', marginTop: spacing.xs },
  toolbarBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  toolbarAddress: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.glassBorder,
  },
  toolbarShareRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDim,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  toolbarArrow: { marginTop: 2 },
});
