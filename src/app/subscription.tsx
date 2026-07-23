import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { ALL_FEATURES, planStatus, type FeatureKey } from '@/services/features';
import { shadows } from '@/theme';
import { SUPPORT_WHATSAPP as SUPPORT_WA } from '@/config/support';

const SUPPORT_WA_DISPLAY = '+49 163 7606478';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Per-feature visuals — matches the icons used on the dashboard. */
const META: Record<FeatureKey, { emoji: string; color: string; bg: string }> = {
  scanner: { emoji: '📷', color: '#2563eb', bg: '#e8f1fe' },
  ai_chat: { emoji: '💬', color: '#7c3aed', bg: '#f3f0ff' },
  ai_call: { emoji: '📞', color: '#0e9f6e', bg: '#e9fbf2' },
};

function WhatsAppIcon({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z" fill="#ffffff" />
      <Path
        d="M8.5 7.3c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3l-1.6-.8c-.2-.1-.4-.1-.6.1l-.6.8c-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3 0-.4l-.5-1.4Z"
        fill="#1fbc78"
      />
    </Svg>
  );
}

function Check({ on, color }: { on: boolean; color: string }) {
  return (
    <View
      style={[
        styles.checkbox,
        on
          ? { backgroundColor: color, borderColor: color }
          : { backgroundColor: '#fff', borderColor: '#d6dbe4' },
      ]}
    >
      {on ? (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 12.5l4.2 4.2L19 7"
            stroke="#ffffff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </View>
  );
}

function ActiveBadge({ label }: { label: string }) {
  return (
    <View style={styles.activeBadge}>
      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
        <Path
          d="M5 12.5l4.2 4.2L19 7"
          stroke="#0f9d58"
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={styles.activeBadgeText}>{label}</Text>
    </View>
  );
}

/**
 * Manage-subscription screen. Lists every premium feature with its live
 * state: unlocked ones show an "Actif" badge; locked ones are selectable
 * checkboxes. The WhatsApp button composes a message from the ticked
 * features so the patient asks support for exactly what they want, and
 * the admin can unlock it from the dashboard.
 */
export default function SubscriptionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const lockedFeatures = useAppStore((s) => s.lockedFeatures);
  const status = planStatus(lockedFeatures);
  const activeCount = ALL_FEATURES.length - ALL_FEATURES.filter((f) =>
    lockedFeatures.includes(f)
  ).length;

  // Locked features are selectable; default them all to "selected" so the
  // common case (unlock everything) is a single tap.
  const lockedList = useMemo(
    () => ALL_FEATURES.filter((f) => lockedFeatures.includes(f)),
    [lockedFeatures]
  );
  const [selected, setSelected] = useState<Set<FeatureKey>>(
    () => new Set(lockedList)
  );

  const toggle = (f: FeatureKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const chosen = lockedList.filter((f) => selected.has(f));

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const contactSupport = () => {
    const lines = chosen.map((f) => `• ${t(featLabel(f))}`).join('\n');
    const message =
      chosen.length > 0
        ? `${t('plan.waIntro')}\n${lines}\n${t('plan.waOutro')}`
        : t('plan.waGeneric');
    const encoded = encodeURIComponent(message);
    Linking.openURL(`whatsapp://send?phone=${SUPPORT_WA}&text=${encoded}`).catch(
      () => Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${encoded}`).catch(() => {})
    );
  };

  const hero = HERO[status];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={close} style={styles.backBtn}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>{t('plan.manageTitle')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 30,
        }}
      >
        {/* Status hero */}
        <LinearGradient
          colors={hero.grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroBadge}>
            <Text style={{ fontSize: 26 }}>{hero.emoji}</Text>
          </View>
          <Text style={styles.heroTitle}>{t(hero.title)}</Text>
          <Text style={styles.heroSub}>
            {status === 'partial'
              ? t('plan.statusPartialSub', {
                  active: activeCount,
                  total: ALL_FEATURES.length,
                })
              : t(hero.sub)}
          </Text>
        </LinearGradient>

        {/* Section title — pick vs. review. */}
        <Text style={styles.sectionTitle}>
          {status === 'full' ? t('plan.yourFeatures') : t('plan.chooseTitle')}
        </Text>
        {status === 'full' ? (
          <View style={{ height: 14 }} />
        ) : (
          <Text style={styles.sectionSub}>{t('plan.chooseSub')}</Text>
        )}

        {/* Feature list — always visible, whatever the plan. Unlocked ones
            show an "Actif" badge; locked ones are selectable checkboxes. */}
        <View style={styles.list}>
          {ALL_FEATURES.map((f) => {
            const locked = lockedFeatures.includes(f);
            const m = META[f];
            const on = selected.has(f);
            return (
              <Pressable
                key={f}
                onPress={locked ? () => toggle(f) : undefined}
                style={[
                  styles.featRow,
                  locked && on && { borderColor: m.color, backgroundColor: `${m.color}0a` },
                  !locked && { borderColor: '#e7f8ef' },
                ]}
              >
                <View style={[styles.featIcon, { backgroundColor: m.bg }]}>
                  <Text style={{ fontSize: 20 }}>{m.emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.featTitle}>{t(featLabel(f))}</Text>
                  <Text style={styles.featDesc}>{t(featDesc(f))}</Text>
                </View>
                {locked ? (
                  <Check on={on} color={m.color} />
                ) : (
                  <ActiveBadge label={t('plan.active')} />
                )}
              </Pressable>
            );
          })}
        </View>

        {status === 'full' ? (
          // Everything unlocked — no request to send, just a friendly note.
          <View style={styles.doneNote}>
            <Text style={{ fontSize: 16 }}>🎉</Text>
            <Text style={styles.doneNoteText}>{t('plan.allActiveSub')}</Text>
          </View>
        ) : (
          <>
            {/* WhatsApp CTA */}
            <Pressable
              onPress={contactSupport}
              disabled={chosen.length === 0}
              style={{ marginTop: 22, opacity: chosen.length === 0 ? 0.5 : 1 }}
            >
              <LinearGradient
                colors={['#25D366', '#1ebe5d']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <WhatsAppIcon />
                <Text style={styles.ctaText}>
                  {chosen.length > 1
                    ? t('plan.contactWaN', { n: chosen.length })
                    : t('plan.contactWa')}
                </Text>
              </LinearGradient>
            </Pressable>
            <Text style={styles.waNumber}>{SUPPORT_WA_DISPLAY}</Text>
            {chosen.length === 0 ? (
              <Text style={styles.hint}>{t('plan.selectAtLeastOne')}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* ── helpers ── */
const featLabel = (f: FeatureKey) =>
  f === 'scanner' ? 'locked.featScanner' : f === 'ai_chat' ? 'locked.featChat' : 'locked.featCall';
const featDesc = (f: FeatureKey) =>
  f === 'scanner' ? 'plan.featScanDesc' : f === 'ai_chat' ? 'plan.featChatDesc' : 'plan.featCallDesc';

const HERO: Record<
  'free' | 'partial' | 'full',
  { emoji: string; title: string; sub: string; grad: [string, string] }
> = {
  free: { emoji: '⭐', title: 'plan.statusFree', sub: 'plan.statusFreeSub', grad: ['#fbbf24', '#f59e0b'] },
  partial: { emoji: '🚀', title: 'plan.statusPartial', sub: 'plan.statusPartialSub', grad: ['#6366f1', '#4f46e5'] },
  full: { emoji: '👑', title: 'plan.statusFull', sub: 'plan.statusFullSub', grad: ['#34d399', '#059669'] },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f7fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headerTitle: { fontFamily: F800, fontSize: 17, color: '#101a2b' },

  heroCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },
  heroBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  heroTitle: { fontFamily: F800, fontSize: 21, color: '#ffffff', letterSpacing: -0.3 },
  heroSub: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 280,
  },

  sectionTitle: { fontFamily: F800, fontSize: 17, color: '#101a2b', marginTop: 26 },
  sectionSub: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#6b7280',
    marginTop: 5,
    marginBottom: 14,
  },

  list: { gap: 11 },
  featRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  featIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featTitle: { fontFamily: F700, fontSize: 14.5, color: '#1a2333' },
  featDesc: { fontFamily: F500, fontSize: 12, color: '#8a94a6', marginTop: 2 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e7f8ef',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  activeBadgeText: { fontFamily: F700, fontSize: 11, color: '#0f9d58' },

  cta: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
  },
  ctaText: { fontFamily: F800, fontSize: 15.5, color: '#ffffff' },
  waNumber: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#8a94a6',
    textAlign: 'center',
    marginTop: 11,
    letterSpacing: 0.3,
  },
  hint: {
    fontFamily: F600,
    fontSize: 12,
    color: '#c0410b',
    textAlign: 'center',
    marginTop: 8,
  },

  doneNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#e7f8ef',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  doneNoteText: {
    flex: 1,
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#0f7a45',
  },
});
