import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONSENT_IDS, CONSENT_META, type ConsentId } from '@/data/consent';
import { isRTL } from '@/i18n';

const N500 = 'Nunito_500Medium';
const N600 = 'Nunito_600SemiBold';
const N700 = 'Nunito_700Bold';
const N800 = 'Nunito_800ExtraBold';

/**
 * Full-page explanation of one consent condition ("Plus de détails" from
 * the wizard's consent step): tinted hero icon, intro, three numbered
 * sections, an "important" callout, and an "I understood" button.
 */
export default function ConsentDetailScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const params = useLocalSearchParams<{ id?: string }>();

  const id: ConsentId = CONSENT_IDS.includes(params.id as ConsentId)
    ? (params.id as ConsentId)
    : 'data';
  const meta = CONSENT_META[id];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/wizard');
  };

  const sections = [1, 2, 3] as const;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 24,
          paddingBottom: Math.max(insets.bottom, 12) + 12,
        }}
      >
        {/* Back */}
        <Pressable onPress={close} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M15 5l-7 7 7 7"
                stroke="#2b3442"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </View>
        </Pressable>

        {/* Hero */}
        <View style={styles.heroWrap}>
          <View style={[styles.heroHalo, { backgroundColor: meta.bg }]}>
            <View style={styles.heroInner}>
              <Text style={{ fontSize: 30 }}>{meta.icon}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title}>{t(`consent.${id}Title`)}</Text>
        <Text style={styles.intro}>{t(`consent.${id}DetailIntro`)}</Text>

        {/* Numbered sections */}
        <View style={{ gap: 12, marginTop: 18 }}>
          {sections.map((n) => (
            <View key={n} style={styles.sectionCard}>
              <View style={[styles.sectionNum, { backgroundColor: meta.bg }]}>
                <Text style={[styles.sectionNumText, { color: meta.accent }]}>
                  {n}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle}>
                  {t(`consent.${id}S${n}T`)}
                </Text>
                <Text style={styles.sectionBody}>
                  {t(`consent.${id}S${n}B`)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Important callout */}
        <View style={styles.noteBox}>
          <Text style={{ fontSize: 16 }}>⚠️</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.noteTitle}>{t('consent.importantLabel')}</Text>
            <Text style={styles.noteText}>{t(`consent.${id}Note`)}</Text>
          </View>
        </View>

        {/* Understood */}
        <Pressable onPress={close} style={{ marginTop: 20 }}>
          <LinearGradient
            colors={['#2ec983', '#1fbc78']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>{t('consent.understood')}</Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fc' },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  heroWrap: { alignItems: 'center', marginTop: 14 },
  heroHalo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
  title: {
    fontFamily: N800,
    fontSize: 23,
    letterSpacing: -0.3,
    color: '#101a2b',
    textAlign: 'center',
    marginTop: 14,
  },
  intro: {
    fontFamily: N500,
    fontSize: 14,
    lineHeight: 20,
    color: '#5f6b7a',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: 'rgba(20,28,45,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  sectionNum: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  sectionNumText: { fontFamily: N800, fontSize: 13.5 },
  sectionTitle: { fontFamily: N800, fontSize: 14.5, color: '#101a2b' },
  sectionBody: {
    fontFamily: N500,
    fontSize: 13,
    lineHeight: 18.5,
    color: '#4a5766',
    marginTop: 4,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fdf0d8',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  noteTitle: { fontFamily: N800, fontSize: 13, color: '#8a5a10' },
  noteText: {
    fontFamily: N600,
    fontSize: 12.5,
    lineHeight: 17.5,
    color: '#7a5a1e',
    marginTop: 3,
  },
  cta: {
    height: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1fbc78',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaText: { fontFamily: N700, fontSize: 16.5, color: '#ffffff' },
});
