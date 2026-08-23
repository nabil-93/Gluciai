import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui';
import { colors } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * WHERE AN UNKNOWN LINK LANDS.
 *
 * WHAT WAS MISSING. The app declares the `glucoai://` scheme and routes several
 * deep links, but had no `+not-found` route. Anything unmatched —
 * `glucoai://typo`, a stale link from an old build, a truncated URL in a
 * message — fell through to Expo Router's built-in screen: unstyled, in
 * ENGLISH regardless of the app language, and offering no way back into the
 * app. A patient reading Arabic could be dropped on an English page with no
 * exit.
 *
 * This screen is deliberately minimal: it says what happened in the patient's
 * own language and gives one way out. It introduces no new product surface and
 * makes no clinical statement.
 *
 * `router.replace` rather than `push`: the unmatched route should not stay on
 * the stack for the back gesture to return to.
 */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('notFoundPage.title')}</Text>
        <Text style={styles.body}>{t('notFoundPage.body')}</Text>
        <AppButton
          label={t('notFoundPage.cta')}
          onPress={() => router.replace('/(tabs)')}
          style={{ marginTop: 20 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 22,
    justifyContent: 'center',
  },
  card: { marginBottom: 80 },
  /* No explicit textAlign: the layout direction is inherited, so Arabic
     mirrors with the rest of the app rather than being pinned left. */
  title: { fontFamily: F800, fontSize: 22, color: '#111827', marginBottom: 10 },
  body: { fontFamily: F500, fontSize: 14, lineHeight: 21, color: '#6b7280' },
});
