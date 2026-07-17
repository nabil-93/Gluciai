import React from 'react';
import { Redirect } from 'expo-router';

import { useAppStore } from '@/store/useAppStore';

export default function Index() {
  const { languageChosen, onboardingDone, wizardDone } = useAppStore();

  if (!languageChosen) return <Redirect href="/welcome" />;
  if (!onboardingDone) return <Redirect href="/onboarding" />;
  if (!wizardDone) return <Redirect href="/auth" />;
  return <Redirect href="/(tabs)" />;
}
