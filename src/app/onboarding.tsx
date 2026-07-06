import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';

/* Onboarding — Poppins, per the "1ere page" design handoff */
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';
const P700 = 'Poppins_700Bold';
const P800 = 'Poppins_800ExtraBold';

const GREEN = '#16b866';
const BTN_GREEN = '#12b86f';

const HERO_MAIN = require('../assets/nfss/hero-main.png');
const HEROES = [
  require('../assets/nfss/hero2.png'),
  require('../assets/nfss/hero3.png'),
  require('../assets/nfss/hero4.png'),
  require('../assets/nfss/hero5.png'),
];

const SLIDE_COUNT = 5;

/* ── Feature icons (from the prototype SVGs) ── */
function CameraIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path
        d="M9 4l-1.3 2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.7L15 4H9z"
        stroke={GREEN}
        strokeWidth={1.9}
        strokeLinejoin="round"
        fill="none"
      />
      <Circle cx={12} cy={13} r={3.4} stroke={GREEN} strokeWidth={1.9} fill="none" />
    </Svg>
  );
}
function SparklesIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z" fill="#8b5cf6" />
      <Path d="M18.5 14l.9 2.6L22 17.5l-2.6.9L18.5 21l-.9-2.6L15 17.5l2.6-.9.9-2.6z" fill="#8b5cf6" />
    </Svg>
  );
}
function BarsIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Rect x={4} y={12} width={4} height={7} rx={1.4} fill="#3b82f6" />
      <Rect x={10} y={8} width={4} height={11} rx={1.4} fill="#3b82f6" />
      <Rect x={16} y={4} width={4} height={15} rx={1.4} fill="#3b82f6" />
    </Svg>
  );
}
function BadgeSparkle() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M12 2l1.6 4.9L18.5 8l-4.9 1.6L12 14l-1.6-4.4L5.5 8l4.9-1.1L12 2z" fill="#17b06b" />
      <Path d="M19 13l.7 2.1L22 16l-2.3.7L19 19l-.7-2.3L16 16l2.3-.9L19 13z" fill="#17b06b" />
    </Svg>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone);
  const [index, setIndex] = useState(0);

  const last = index === SLIDE_COUNT - 1;

  const finish = () => {
    setOnboardingDone();
    router.replace('/auth');
  };

  const next = () => {
    if (last) finish();
    else setIndex(index + 1);
  };

  const back = () => {
    if (index > 0) setIndex(index - 1);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      {/* Passer */}
      <View style={styles.topBar}>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={styles.skipText}>{t('common.skip')}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {index === 0 ? (
          /* ═══ SLIDE 1 — rich design ═══ */
          <FadeInView key="s0" distance={12} duration={480} style={{ flex: 1 }}>
            {/* Full-bleed hero */}
            <Image
              source={HERO_MAIN}
              style={styles.heroMain}
              resizeMode="contain"
            />
            {/* Badge */}
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <BadgeSparkle />
                <Text style={styles.badgeText}>{t('onboarding.slide1Badge')}</Text>
              </View>
            </View>
            {/* Two-tone title */}
            <Text style={styles.bigTitle}>{t('onboarding.slide1Title')}</Text>
            {/* Subtitle */}
            <Text style={styles.bigSub}>{t('onboarding.slide1Desc')}</Text>
            {/* Feature card */}
            <View style={styles.featureCard}>
              <View style={styles.featureCol}>
                <View style={[styles.featureIcon, { backgroundColor: '#dcf3e6' }]}>
                  <CameraIcon />
                </View>
                <Text style={styles.featureText}>{t('onboarding.slide1Feature1')}</Text>
              </View>
              <View style={[styles.featureCol, styles.featureColMid]}>
                <View style={[styles.featureIcon, { backgroundColor: '#ece6fd' }]}>
                  <SparklesIcon />
                </View>
                <Text style={styles.featureText}>{t('onboarding.slide1Feature2')}</Text>
              </View>
              <View style={styles.featureCol}>
                <View style={[styles.featureIcon, { backgroundColor: '#dcebfe' }]}>
                  <BarsIcon />
                </View>
                <Text style={styles.featureText}>{t('onboarding.slide1Feature3')}</Text>
              </View>
            </View>
          </FadeInView>
        ) : (
          /* ═══ SLIDES 2-5 ═══ */
          <FadeInView key={`s${index}`} distance={12} duration={480} style={styles.slideWrap}>
            <View style={styles.slideHeroWrap}>
              <Image
                source={HEROES[index - 1]}
                style={styles.slideHero}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.slideTitle}>
              {t(`onboarding.slide${index + 1}Title`)}
            </Text>
            <Text style={styles.slideSub}>
              {t(`onboarding.slide${index + 1}Desc`)}
            </Text>
          </FadeInView>
        )}
      </ScrollView>

      {/* Dots */}
      <View style={styles.dots}>
        {Array.from({ length: SLIDE_COUNT }).map((_, k) => (
          <View key={k} style={[styles.dot, k === index && styles.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      <View
        style={{
          paddingHorizontal: 26,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
        }}
      >
        <Pressable onPress={next} style={styles.cta}>
          <Text style={styles.ctaText}>
            {last ? t('onboarding.getStarted') : t('common.next')}
          </Text>
          <Svg width={26} height={26} viewBox="0 0 24 24" style={styles.ctaArrow}>
            <Path
              d="M4 12h15M13 6l6 6-6 6"
              stroke="#fff"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Pressable>
        <View style={styles.backWrap}>
          {index > 0 ? (
            <Pressable onPress={back} hitSlop={10}>
              <Text style={styles.backText}>{t('common.back')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f9fd' },
  topBar: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 26,
  },
  skipText: { fontFamily: P500, fontSize: 19, color: '#7b8792' },

  /* Slide 1 */
  heroMain: { width: '100%', height: 330 },
  badgeRow: { alignItems: 'center', marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#d7f4e5',
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: P600,
    fontSize: 15,
    letterSpacing: 0.2,
    color: '#17b06b',
  },
  bigTitle: {
    fontFamily: P800,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.8,
    color: GREEN,
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 26,
  },
  bigSub: {
    fontFamily: P500,
    fontSize: 18,
    lineHeight: 26,
    color: '#6b7580',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 34,
  },
  bigSubStrong: { fontFamily: P700, color: GREEN },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 6,
    marginTop: 26,
    marginHorizontal: 26,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
    elevation: 5,
  },
  featureCol: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
  },
  featureColMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#eef0f4',
  },
  featureIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: P600,
    fontSize: 14,
    lineHeight: 18,
    color: '#3a444e',
    textAlign: 'center',
  },

  /* Slides 2-5 */
  slideWrap: { flex: 1, paddingHorizontal: 26 },
  slideHeroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  slideHero: { width: '100%', height: '100%' },
  slideTitle: {
    fontFamily: P800,
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: -0.6,
    color: '#1b2733',
    textAlign: 'center',
    marginBottom: 14,
  },
  slideSub: {
    fontFamily: P500,
    fontSize: 17,
    lineHeight: 25,
    color: '#6b7580',
    textAlign: 'center',
    maxWidth: 340,
    alignSelf: 'center',
  },

  /* Dots */
  dots: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 26,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#cfd5dd',
  },
  dotActive: {
    width: 26,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#06b870',
  },

  /* CTA */
  cta: {
    height: 74,
    borderRadius: 22,
    backgroundColor: BTN_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#12b86f',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 8,
  },
  ctaText: { fontFamily: P700, fontSize: 21, color: '#ffffff' },
  ctaArrow: { position: 'absolute', right: 30 },
  backWrap: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  backText: { fontFamily: P700, fontSize: 17, color: '#7b8792' },
});
