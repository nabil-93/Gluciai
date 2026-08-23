import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, BevelCard, ChevronLeft } from '@/components/ui';
import { notify } from '@/lib/confirm';
import { requestOrOpenSettings } from '@/lib/permissions';
import {
  getPlannedReminders,
  refreshSmartReminders,
} from '@/services/notifications';
import { colors, shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

export default function RappelsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  /** The OS refused. Shown with a way out, never as a dead end. */
  const [denied, setDenied] = useState(false);

  const reminders = useMemo(() => getPlannedReminders(t), [t]);
  const isWeb = Platform.OS === 'web';

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /*
   * "Rappels activés ✓" MUST MEAN THE OS ACCEPTED THEM.
   *
   * This used to `await refreshSmartReminders()` and then set `activated`
   * unconditionally. That call swallowed a denied permission and every
   * platform failure, so a patient who refused the OS prompt — or whose
   * device could not schedule at all — was still shown the success state.
   * Someone relying on an insulin reminder was told it was on when nothing
   * had been registered.
   *
   * The service now reports what happened, and only 'scheduled' is success.
   */
  const activate = async () => {
    setActivating(true);
    setDenied(false);
    try {
      const result = await refreshSmartReminders();
      if (result === 'scheduled') setActivated(true);
      else if (result === 'denied') setDenied(true);
      else notify(t('rappelsPage.title'), t('rappelsPage.unavailable'));
    } finally {
      setActivating(false);
    }
  };

  /*
   * Once the OS will no longer show the prompt, asking again resolves
   * `denied` immediately and the button does nothing — the B-3 defect. The
   * shared helper sends the patient to Settings instead. Notification
   * permissions expose no `canAskAgain` here, so we pass the shape the
   * decision needs: we have just been refused, and on iOS that is final.
   */
  const fixPermission = () =>
    requestOrOpenSettings({ granted: false, canAskAgain: false }, async () => {
      await activate();
    });

  const fmt = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('rappelsPage.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.subtitle}>{t('rappelsPage.subtitle')}</Text>

        <View style={{ gap: 10 }}>
          {reminders.map((r) => (
            <BevelCard key={r.id} style={styles.row}>
              <View style={styles.iconWrap}>
                <Text style={{ fontSize: 20 }}>{r.icon}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowBody} numberOfLines={2}>
                  {r.body}
                </Text>
                <Text style={styles.rowReason}>✨ {r.reason}</Text>
              </View>
              <View style={styles.timeBadge}>
                <Text style={styles.timeText}>{fmt(r.hour, r.minute)}</Text>
                <Text style={styles.timeSub}>{t('rappelsPage.everyDay')}</Text>
              </View>
            </BevelCard>
          ))}
        </View>

        {isWeb ? (
          <View style={styles.webNote}>
            <Text style={styles.webNoteText}>{t('rappelsPage.webNote')}</Text>
          </View>
        ) : (
          <>
            <AppButton
              label={activated ? t('rappelsPage.activated') : t('rappelsPage.activate')}
              onPress={activate}
              loading={activating}
              disabled={activated}
              style={{ marginTop: 18 }}
            />
            {/* A refusal is not a dead end: say so in the patient's language
                and offer the only action that can still work. */}
            {denied ? (
              <View style={styles.deniedBox}>
                <Text style={styles.deniedText}>
                  {t('rappelsPage.permissionDenied')}
                </Text>
                <Pressable onPress={fixPermission} hitSlop={8}>
                  <Text style={styles.deniedLink}>
                    {t('rappelsPage.openSettings')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        )}

        <Text style={styles.footNote}>{t('rappelsPage.footNote')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 18, color: '#111827' },
  subtitle: {
    fontFamily: F500,
    fontSize: 13.5,
    lineHeight: 19,
    color: '#6b7280',
    marginBottom: 16,
    marginHorizontal: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: F700, fontSize: 14.5, color: '#111827' },
  rowBody: {
    fontFamily: F500,
    fontSize: 12,
    lineHeight: 16,
    color: '#6b7280',
    marginTop: 2,
  },
  rowReason: {
    fontFamily: F600,
    fontSize: 10.5,
    color: '#7c6cf6',
    marginTop: 4,
  },
  timeBadge: { alignItems: 'center' },
  timeText: { fontFamily: F800, fontSize: 15, color: '#111827' },
  timeSub: { fontFamily: F500, fontSize: 9.5, color: '#9CA3AF', marginTop: 1 },
  webNote: {
    marginTop: 18,
    backgroundColor: '#f3f0ff',
    borderRadius: 14,
    padding: 14,
  },
  webNoteText: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#5b4ce0',
  },
  footNote: {
    fontFamily: F500,
    fontSize: 11.5,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 14,
  },
  deniedBox: {
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  deniedText: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#B91C1C',
    // No explicit textAlign: RTL is inherited from the app's layout direction,
    // so Arabic mirrors with the rest of the screen.
  },
  deniedLink: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#5b4ce0',
    textDecorationLine: 'underline',
  },
});
