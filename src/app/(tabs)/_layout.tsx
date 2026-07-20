import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { BevelTabBar } from '@/components/ui';
import { TabBarVisibilityProvider } from '@/components/ui/TabBarVisibility';
import { PlanWelcome } from '@/components/PlanWelcome';
import { AppAlert } from '@/components/AppAlert';
import { refreshFeatureLocks } from '@/services/features';
import { refreshUsage } from '@/services/usage';
import { refreshSmartReminders } from '@/services/notifications';
import { checkReminders } from '@/services/reminders';
import { startPresence } from '@/services/presence';
import { hydrateFromServer } from '@/services/sync';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { t } = useTranslation();

  // Smart Notification Engine: build reminders from the user's habits.
  // Also sync the per-account feature locks set from the admin dashboard,
  // and refresh the store from the server (source of truth) — this is what
  // restores the full history after a reinstall or on a second device.
  useEffect(() => {
    refreshSmartReminders();
    refreshFeatureLocks();
    refreshUsage();
    hydrateFromServer().then(() => checkReminders());
    // "Dernière connexion" heartbeat for the dashboard (now + on foreground).
    const stopPresence = startPresence();
    // AI reminders tick: fire due ones + "did you do it?" follow-ups.
    const id = setInterval(checkReminders, 60_000);
    return () => {
      clearInterval(id);
      stopPresence();
    };
  }, []);

  return (
    <TabBarVisibilityProvider>
      <Tabs
        tabBar={(props) => <BevelTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t('tabs.home') }} />
        <Tabs.Screen name="journal" options={{ title: t('tabs.journal') }} />
        <Tabs.Screen name="activity" options={{ title: t('tabs.activity') }} />
        <Tabs.Screen name="biology" options={{ title: t('tabs.biology') }} />
      </Tabs>
      <PlanWelcome />
      <AppAlert />
    </TabBarVisibilityProvider>
  );
}
