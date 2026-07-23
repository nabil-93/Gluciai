import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { AnimatedRobot } from '@/components/ui';
import { hasWhatsappSupport, whatsappUrl } from '@/config/support';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN_D = '#0F7A42';
const WA = '#1DA851';
const INK = '#1e2a23';
const MUTED = '#67736B';

/**
 * Support & Help hub, reached from Profile.
 *
 * Two ways out of a problem, in order of how fast they resolve it: the AI
 * assistant that knows the app (instant, handles "how do I…"), then a human on
 * WhatsApp. The robot introduces itself with a speech bubble rather than a
 * silent icon, so the assistant reads as someone offering help.
 */
export default function SupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openWhatsapp = () => {
    void Linking.openURL(whatsappUrl());
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#3e4c44', '#2c3730', '#242e28']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.navRow}>
          <Pressable
            style={styles.navBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m15 18-6-6 6-6" />
            </Svg>
          </Pressable>
          <Text style={styles.navTitle}>{t('support.title')}</Text>
          <View style={styles.navBtn} />
        </View>
        <Text style={styles.headerSub}>{t('support.subtitle')}</Text>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 28 + insets.bottom, gap: 12 }}
      >
        {/* ── The assistant introduces itself, speech bubble first ── */}
        <View style={styles.aiCard}>
          <View style={styles.bubbleRow}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{t('support.bubble')}</Text>
              {/* little tail pointing down at the robot */}
              <View style={styles.bubbleTail} />
            </View>
          </View>
          <View style={styles.robotRow}>
            {/* Transparent wrapper — the mascot floats, never sits in a chip */}
            <AnimatedRobot size={54} mood="happy" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.aiTitle}>{t('support.aiTitle')}</Text>
              <Text style={styles.aiSub}>{t('support.aiSub')}</Text>
            </View>
          </View>
          <Pressable
            style={styles.aiCta}
            onPress={() => router.push('/support-ai' as never)}
            accessibilityRole="button"
          >
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </Svg>
            <Text style={styles.aiCtaText}>{t('support.aiCta')}</Text>
          </Pressable>
        </View>

        {/* ── Human channel. Hidden entirely when no number is configured —
            better no button than one that opens a broken chat. ── */}
        {hasWhatsappSupport() ? (
          <Pressable style={styles.waCard} onPress={openWhatsapp} accessibilityRole="button">
            <View style={styles.waIcon}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="#fff">
                <Path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.27.86 5.82 2.42a8.2 8.2 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18s.21-1.07.15-1.18c-.07-.1-.23-.16-.48-.28-.25-.14-1.47-.74-1.69-.82-.23-.08-.37-.12-.56.12-.16.25-.64.81-.78.97-.15.17-.29.19-.53.07-.26-.13-1.06-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.12-.24-.01-.39.11-.5.11-.11.27-.29.37-.44.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.77-1.85-.2-.5-.4-.42-.56-.43z" />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.waTitle}>{t('support.waTitle')}</Text>
              <Text style={styles.waSub}>{t('support.waSub')}</Text>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9fb8a8" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m9 18 6-6-6-6" />
            </Svg>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef1ec' },

  header: { paddingBottom: 18 },
  navRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { color: '#fff', fontSize: 17, fontFamily: F700 },
  headerSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontFamily: F500,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 2,
  },

  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    gap: 12,
    shadowColor: 'rgba(28,39,33,1)',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bubbleRow: { alignItems: 'flex-start' },
  bubble: {
    backgroundColor: '#EAF7EF',
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    maxWidth: '92%',
  },
  bubbleText: { fontSize: 12.5, lineHeight: 17, color: '#14532d', fontFamily: F600 },
  bubbleTail: {
    position: 'absolute',
    left: 16,
    bottom: -5,
    width: 10,
    height: 10,
    backgroundColor: '#EAF7EF',
    transform: [{ rotate: '45deg' }],
  },
  robotRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiTitle: { fontSize: 13.5, fontFamily: F800, color: INK },
  aiSub: { fontSize: 11.5, lineHeight: 16, color: MUTED, fontFamily: F500, marginTop: 3 },
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: GREEN_D,
    borderRadius: 14,
    paddingVertical: 13,
  },
  aiCtaText: { fontSize: 13, fontFamily: F800, color: '#fff' },

  waCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    shadowColor: 'rgba(28,39,33,1)',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  waIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: WA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waTitle: { fontSize: 13, fontFamily: F800, color: INK },
  waSub: { fontSize: 11.5, color: MUTED, fontFamily: F500, marginTop: 2 },
});
