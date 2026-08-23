import React, { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
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
import { hasStoredSession, isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  /*
   * A SESSION THAT IS GONE MUST TAKE THE PATIENT TO THE LOGIN SCREEN.
   *
   * Routing into the app is decided from persisted local flags — that is
   * deliberate, it is what lets the app open offline. But the flags say
   * nothing about whether the token is still valid. Two ways they can
   * disagree with reality:
   *
   *   · the refresh token was revoked or expired while the app was closed;
   *   · a sign-out failed to delete the stored session (fixed in
   *     services/account, but older installs still carry the mess).
   *
   * Either way every request comes back empty and the patient sits in front
   * of a dashboard that has quietly stopped working. Checked once on mount,
   * and again whenever supabase reports the session ended.
   *
   * BEING OFFLINE IS NOT BEING SIGNED OUT. The mount check asks whether a
   * session is STORED, never whether one can be refreshed right now — a
   * patient with no bars keeps their app. Only supabase itself declaring the
   * session over (a refresh the server actively rejected) ends it.
   */
  useEffect(() => {
    if (isDemoMode || !supabase) return;
    let alive = true;
    const leave = () => {
      if (!alive) return;
      useAppStore.getState().resetAll();
      router.replace('/auth');
    };
    void hasStoredSession().then((stored) => {
      // Nothing stored AND local state that claims an account: they are
      // signed out. A store with no account recorded has never synced and is
      // left alone.
      if (!stored && useAppStore.getState().accountUserId) leave();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') leave();
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

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

  /*
   * Reschedule the OS reminders when the language changes.
   *
   * The notification text is resolved at SCHEDULING time, not at delivery, so
   * a patient who switches language mid-session would keep receiving the
   * previous language until the next cold start. Kept as its own effect rather
   * than added to the dependency list above, which would also re-run the
   * server hydration and the presence heartbeat on every language change.
   *
   * `refreshSmartReminders` cancels all scheduled notifications before
   * rebuilding, so re-running it is idempotent and cannot duplicate a reminder.
   */
  useEffect(() => {
    refreshSmartReminders();
  }, [i18n.language]);

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
