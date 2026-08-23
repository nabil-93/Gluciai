import React, { useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';

/**
 * THE ROUTE DECISION HAS TO WAIT FOR THE DISK.
 *
 * The store is persisted to AsyncStorage, which is asynchronous: on the very
 * first render `languageChosen`, `onboardingDone` and `wizardDone` are all
 * still the built-in defaults — `false` — whatever the device actually holds.
 * Reading them at that moment sent a signed-in patient to `/welcome`, and
 * `<Redirect>` navigates on mount, so by the time the real values arrived the
 * app had already left this screen. Nothing brought it back.
 *
 * It usually got away with it because the fonts and i18n init in the root
 * layout take long enough for the read to finish first. That is a race, not a
 * guarantee: the bigger the stored history the slower the read, and the more
 * often a returning patient was dropped back on the intro or the login form.
 *
 * Rehydration is an external store with a subscribe and a snapshot, so it is
 * read as one — no effect, no cascading render.
 */
const subscribeHydration = (onChange: () => void) =>
  useAppStore.persist.onFinishHydration(onChange);
const readHydrated = () => useAppStore.persist.hasHydrated();

export default function Index() {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    readHydrated,
    readHydrated
  );
  const { languageChosen, onboardingDone, wizardDone } = useAppStore();

  // Splash colour, not a spinner: this lasts one storage read.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  if (!languageChosen) return <Redirect href="/welcome" />;
  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (!wizardDone) return <Redirect href="/auth" />;
  return <Redirect href="/(tabs)" />;
}
