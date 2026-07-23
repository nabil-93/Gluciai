import React, { useEffect } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { UsageBar } from '@/components/ui';
import { isRTL } from '@/i18n';
import { refreshUsage } from '@/services/usage';
import { useAppStore } from '@/store/useAppStore';
import type { UsageFeature, UsageStat } from '@/types';
import { SUPPORT_WHATSAPP as SUPPORT_WA } from '@/config/support';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* Mint Hub palette — matches profile.tsx. */
const INK = '#0C1D16';
const MUTED = '#8CA097';
const GREEN_DEEP = '#0FA968';
const CARD_BORDER = '#E7EDE9';

/** Support WhatsApp (same as LockedFeature) — to ask for a higher limit. */

const META: Record<UsageFeature, { emoji: string; tint: string }> = {
  scanner: { emoji: '📷', tint: '#E8F1FA' },
  ai_chat: { emoji: '💬', tint: '#EFEDFB' },
  ai_call: { emoji: '📞', tint: '#E9FBF2' },
  labs: { emoji: '🧪', tint: '#FBEFFB' },
};
const ORDER: UsageFeature[] = ['scanner', 'ai_chat', 'ai_call', 'labs'];

const BackIcon = () => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <Path d="m15 18-6-6 6-6" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

function openSupport(message: string) {
  const encoded = encodeURIComponent(message);
  Linking.openURL(`whatsapp://send?phone=${SUPPORT_WA}&text=${encoded}`).catch(() =>
    Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${encoded}`).catch(() => {})
  );
}

function UsageCard({ feature, stat }: { feature: UsageFeature; stat?: UsageStat }) {
  const { t } = useTranslation();
  const meta = META[feature];
  const unlimited = !stat || stat.unlimited || stat.limit == null;
  const used = stat?.used ?? 0;
  const limit = stat?.limit ?? null;
  const remaining = stat?.remaining ?? null;
  const period = stat?.period ?? 'day';
  const exceeded = stat?.exceeded ?? false;
  const fraction = !unlimited && limit && limit > 0 ? used / limit : 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.icon, { backgroundColor: meta.tint }]}>
          <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{t(`usage.feat_${feature}`)}</Text>
          <Text style={styles.cardPeriod}>{t(`usage.period_${period}`)}</Text>
        </View>
        {unlimited ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{t('usage.unlimited')}</Text>
          </View>
        ) : (
          <Text style={[styles.count, exceeded && { color: '#E05252' }]}>
            <Text style={styles.countBig}>{used}</Text>
            <Text style={styles.countSmall}> / {limit}</Text>
          </Text>
        )}
      </View>

      <UsageBar fraction={fraction} unlimited={unlimited} />

      <Text style={[styles.sub, exceeded && { color: '#E05252', fontFamily: F700 }]}>
        {unlimited
          ? t('usage.unlimitedNote')
          : exceeded
            ? t('usage.reachedReset', { reset: t(`usage.reset_${period}`) })
            : t('usage.remaining', {
                count: remaining ?? 0,
                unit: t(`usage.unit_${feature}`),
              })}
      </Text>
    </View>
  );
}

export default function UsageLimitsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const usage = useAppStore((s) => s.usage);
  const locked = useAppStore((s) => s.lockedFeatures);
  const granted = useAppStore((s) => s.grantedFeatures);

  // Always pull the freshest numbers when the screen opens.
  useEffect(() => {
    refreshUsage();
  }, []);

  const visible = ORDER.filter((f) =>
    f === 'labs' ? granted.includes('labs') : !locked.includes(f)
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={close} hitSlop={8} style={styles.headerBtn}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <BackIcon />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>{t('usage.title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{t('usage.subtitle')}</Text>

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 30 }}>✅</Text>
            <Text style={styles.emptyTxt}>{t('usage.empty')}</Text>
          </View>
        ) : (
          visible.map((f) => (
            <UsageCard key={f} feature={f} stat={usage.find((u) => u.feature === f)} />
          ))
        )}

        <Pressable
          onPress={() => openSupport(t('usage.supportMessage'))}
          style={({ pressed }) => [styles.support, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.supportTxt}>{t('usage.support')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F9F7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  headerTitle: { fontFamily: F800, fontSize: 17, color: INK },
  subtitle: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
    marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: F700, fontSize: 14.5, color: INK },
  cardPeriod: { fontFamily: F600, fontSize: 11.5, color: MUTED, marginTop: 2 },
  count: { fontFamily: F600, color: INK },
  countBig: { fontFamily: F800, fontSize: 19, color: INK },
  countSmall: { fontFamily: F600, fontSize: 13, color: MUTED },
  badge: {
    backgroundColor: '#E7F7EE',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeTxt: { fontFamily: F700, fontSize: 11, color: GREEN_DEEP },
  sub: { fontFamily: F600, fontSize: 12, color: MUTED, marginTop: 10 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyTxt: { fontFamily: F600, fontSize: 13, color: MUTED, textAlign: 'center' },
  support: { alignSelf: 'center', marginTop: 18, padding: 8 },
  supportTxt: {
    fontFamily: F700,
    fontSize: 13,
    color: GREEN_DEEP,
    textDecorationLine: 'underline',
  },
});
