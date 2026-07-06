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

  const reminders = useMemo(() => getPlannedReminders(t), [t]);
  const isWeb = Platform.OS === 'web';

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const activate = async () => {
    setActivating(true);
    try {
      await refreshSmartReminders();
      setActivated(true);
    } finally {
      setActivating(false);
    }
  };

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
          <Text style={styles.headTitle}>Rappels intelligents</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.subtitle}>
          GlucoAI apprend vos horaires (mesures, injections, repas) et vous
          rappelle au bon moment — pas à des heures arbitraires.
        </Text>

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
                <Text style={styles.timeSub}>chaque jour</Text>
              </View>
            </BevelCard>
          ))}
        </View>

        {isWeb ? (
          <View style={styles.webNote}>
            <Text style={styles.webNoteText}>
              📱 Les notifications s'activent sur iPhone et Android — sur le
              web, cet aperçu montre ce qui sera programmé.
            </Text>
          </View>
        ) : (
          <AppButton
            label={
              activated ? '✓ Rappels activés' : 'Activer les notifications'
            }
            onPress={activate}
            loading={activating}
            disabled={activated}
            style={{ marginTop: 18 }}
          />
        )}

        <Text style={styles.footNote}>
          Les horaires se réajustent automatiquement au fil de vos
          enregistrements.
        </Text>
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
});
