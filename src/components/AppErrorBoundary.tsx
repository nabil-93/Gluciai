import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react-native';

import { colors } from '@/theme';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * The screen a patient sees when something throws while rendering.
 *
 * Before this existed, a render error unmounted the tree and left a blank
 * white screen — no message, no way back, on a device someone may be holding
 * while deciding what to do about their glucose.
 *
 * TWO RULES GOVERN THE COPY, and they matter more than the styling:
 *
 *  1. It never states the OUTCOME of whatever was in flight. A boundary
 *     renders precisely because state is untrustworthy, so "your data is
 *     safe" and "nothing was saved" are both guesses. Neither is said.
 *
 *  2. It never shows a number carried over from the crashed state — no dose,
 *     no glucose, no carbohydrate. Rendering a figure out of state that just
 *     failed is how a crash turns into a misleading prescription.
 *
 * `variant="clinical"` is used by routes where an interrupted action could
 * have touched the health record; it adds an instruction to check the log
 * first and to recalculate rather than trust what was on screen.
 */
export function AppErrorBoundary({
  error,
  retry,
  variant = 'generic',
}: ErrorBoundaryProps & { variant?: 'generic' | 'clinical' }) {
  const { t } = useTranslation();
  const clinical = variant === 'clinical';

  // Report the ERROR and which boundary caught it — nothing else. No props, no
  // store, no screen state: this component renders because that state is
  // untrustworthy, and attaching it is how a crash report becomes a health-data
  // leak. Everything still passes through the scrubbers in lib/observability,
  // and while no DSN is configured this is a no-op.
  React.useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: variant } });
  }, [error, variant]);

  const goHome = () => {
    // `replace`, not `push`: the crashed route must not stay on the stack
    // where a back gesture would land the patient straight back on it.
    try {
      router.replace('/');
    } catch {
      /* if the router itself is the thing that broke, retry is still offered */
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.badge, clinical && styles.badgeClinical]}>
          <Text style={styles.badgeMark}>{clinical ? '💉' : '⚠️'}</Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {t('errorBoundary.title')}
        </Text>

        <Text style={styles.body}>{t('errorBoundary.body')}</Text>

        {clinical ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t('errorBoundary.clinicalNotice')}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel={t('errorBoundary.retry')}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{t('errorBoundary.retry')}</Text>
        </Pressable>

        <Pressable
          onPress={goHome}
          accessibilityRole="button"
          accessibilityLabel={t('errorBoundary.goHome')}
          style={styles.secondary}
        >
          <Text style={styles.secondaryText}>{t('errorBoundary.goHome')}</Text>
        </Pressable>

        {/* Developer detail only. Never shipped to a patient: a stack trace is
            noise to them, and `error.message` can echo values from the very
            state that just failed. */}
        {__DEV__ ? (
          <View style={styles.debug}>
            <Text style={styles.debugTitle}>Dev only — not shown in release</Text>
            <Text style={styles.debugText}>{String(error?.message ?? error)}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** Root fallback: reached by any route that does not define its own. */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorBoundary {...props} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 14,
  },

  badge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningDim,
    marginBottom: 4,
  },
  badgeClinical: { backgroundColor: colors.dangerDim },
  badgeMark: { fontSize: 34 },

  title: {
    fontFamily: F800,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: F600,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 340,
  },

  notice: {
    backgroundColor: colors.dangerDim,
    borderRadius: 16,
    padding: 14,
    maxWidth: 360,
  },
  noticeText: {
    fontFamily: F600,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text,
    textAlign: 'center',
  },

  primary: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 40,
    minWidth: 220,
    alignItems: 'center',
  },
  primaryText: { fontFamily: F700, fontSize: 15, color: colors.textOnPrimary },

  secondary: {
    borderRadius: 999,
    paddingVertical: 13,
    paddingHorizontal: 32,
    minWidth: 220,
    alignItems: 'center',
  },
  secondaryText: { fontFamily: F700, fontSize: 14.5, color: colors.textSecondary },

  debug: {
    marginTop: 22,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 12,
    maxWidth: 360,
  },
  debugTitle: { fontFamily: F700, fontSize: 11, color: colors.textTertiary, marginBottom: 4 },
  debugText: { fontFamily: F600, fontSize: 11.5, color: colors.textSecondary },
});
