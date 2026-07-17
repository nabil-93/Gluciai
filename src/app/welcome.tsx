import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Image as SvgImage,
  LinearGradient as SvgLinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SUPPORTED_LANGUAGES, setAppLanguage, type LanguageCode } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

/* Welcome — "Smart Nutrition" hero landing, from the
 * "mnin kat7el application awal page" design handoff (Poppins). */
const P500 = 'Poppins_500Medium';
const P600 = 'Poppins_600SemiBold';
const P700 = 'Poppins_700Bold';

const DISH = require('../assets/welcome/dish-final.png');
const BOTTLE = require('../assets/welcome/bottle-final.png');

const HERO_H = 432;

/* ── Small SVG pieces from the prototype ── */
function GlobeIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 14 14">
      <Circle cx={7} cy={7} r={6} fill="none" stroke="#5a6a63" strokeWidth={1.2} />
      <Ellipse cx={7} cy={7} rx={2.6} ry={6} fill="none" stroke="#5a6a63" strokeWidth={1.2} />
      <Path d="M1.4 7h11.2" stroke="#5a6a63" strokeWidth={1.2} />
    </Svg>
  );
}
function ChevronDown() {
  return (
    <Svg width={9} height={6} viewBox="0 0 10 6">
      <Path d="M1 1l4 4 4-4" fill="none" stroke="#8a958e" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Rect x={5} y={0} width={2} height={12} rx={1} fill={color} />
      <Rect x={0} y={5} width={12} height={2} rx={1} fill={color} />
    </Svg>
  );
}
function Leaf({ size, color, rotate }: { size: number; color: string; rotate?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      style={rotate ? { transform: [{ rotate }] } : undefined}
    >
      <Path
        d="M10.5 1.5C6 1.5 2.5 4 2.2 8.6c0 .5.3.9.8.9C7.7 9.7 10.2 6.4 10.5 1.5Z"
        fill={color}
      />
    </Svg>
  );
}
function PulseLine() {
  return (
    <Svg width={26} height={16} viewBox="0 0 26 16">
      <Path
        d="M1 8h5l3-6 4 12 3-6h9"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function TargetIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} r={6.2} fill="none" stroke="#3fae62" strokeWidth={1.5} />
      <Circle cx={8} cy={8} r={3} fill="none" stroke="#3fae62" strokeWidth={1.5} />
      <Circle cx={8} cy={8} r={1} fill="#3fae62" />
    </Svg>
  );
}
function BarsIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Rect x={2} y={9} width={3} height={5} rx={1} fill="#4aa3e8" />
      <Rect x={6.5} y={6} width={3} height={8} rx={1} fill="#4aa3e8" />
      <Rect x={11} y={2.5} width={3} height={11.5} rx={1} fill="#4aa3e8" />
    </Svg>
  );
}
function TrophyIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M4 2h8v4a4 4 0 01-8 0V2z" fill="#eebe3f" />
      <Rect x={7} y={9.5} width={2} height={3} fill="#eebe3f" />
      <Rect x={4.5} y={12.5} width={7} height={1.8} rx={0.9} fill="#eebe3f" />
    </Svg>
  );
}

/* Photo whose edges melt into the page with a soft radial fade — the SVG
 * equivalent of the design's CSS mask-image, so the studio background of
 * the photo never shows against the page gradient. */
function FadedPhoto({
  id,
  source,
  width,
  height,
  fadeFrom,
  fadeTo = 1,
}: {
  id: string;
  source: React.ComponentProps<typeof SvgImage>['href'];
  width: number;
  height: number;
  /** 0–1: radius where the fade to transparent starts */
  fadeFrom: number;
  fadeTo?: number;
}) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id={`${id}-fade`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset={fadeFrom} stopColor="#fff" stopOpacity={1} />
          <Stop offset={fadeTo} stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-fade)`} />
        </Mask>
      </Defs>
      <SvgImage
        x={0}
        y={0}
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid slice"
        href={source}
        mask={`url(#${id}-mask)`}
      />
    </Svg>
  );
}

/* 74% score ring — conic gradient approximated with a dashed SVG arc */
function ScoreRing() {
  const size = 62;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#58c46e" />
            <Stop offset="1" stopColor="#2fb3a2" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#ecf1ec" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * 0.74} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringValue}>74%</Text>
    </View>
  );
}

/* Gentle vertical float loop for the hero cards */
function useFloat(distance: number, duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return {
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) },
    ],
  };
}

/* Staggered entrance (fade + rise) */
function useEnter(delay: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 520,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };
}

function ProgressRow({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View>
      <View style={styles.progressLabels}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>{value}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const setLanguageChosen = useAppStore((s) => s.setLanguageChosen);
  const [menuOpen, setMenuOpen] = useState(false);

  // One-screen layout: shrink the hero (down to 62%) until the language row,
  // hero and the full sheet — CTA, login link and features included — fit the
  // viewport with no scrolling. 405 ≈ tallest sheet (3-line title locales).
  const SHEET_BUDGET = 405;
  const langRowH = insets.top + 47;
  const heroBoxH = Math.min(
    HERO_H,
    Math.max(HERO_H * 0.62, winH - langRowH - SHEET_BUDGET + 26)
  );
  const scale = heroBoxH / HERO_H;
  // Widen the design box by 1/scale so the hero still bleeds edge-to-edge
  // after scaling instead of floating in the middle with side gaps.
  const heroW = 390 / scale;

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[1];

  const floatScore = useFloat(6, 2600);
  const floatProgress = useFloat(7, 2900, 500);
  const floatTag = useFloat(5, 2400, 900);
  const floatPulse = useFloat(4, 2200, 300);

  const enterHero = useEnter(0);
  const enterSheet = useEnter(180);

  const pickLanguage = async (code: LanguageCode) => {
    setMenuOpen(false);
    await setAppLanguage(code);
  };

  const start = () => {
    setLanguageChosen();
    router.replace('/onboarding');
  };

  const login = () => {
    setLanguageChosen();
    router.push({ pathname: '/auth', params: { mode: 'login' } });
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#fbfcfa', '#f2f8f0', '#e9f4ec', '#ebf5ea', '#f0f7ee']}
        locations={[0, 0.3, 0.55, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* soft radial tints */}
      <Svg style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Defs>
          <RadialGradient id="tintGreen" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#bee8cd" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#bee8cd" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="tintBlue" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#b9deee" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#b9deee" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={130} cy={270} r={210} fill="url(#tintGreen)" />
        <Circle cx={370} cy={340} r={200} fill="url(#tintBlue)" />
      </Svg>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 10) + 10 }}
      >
        {/* language switcher */}
        <View style={[styles.langRow, { paddingTop: insets.top + 14 }]}>
          <View>
            <Pressable
              onPress={() => setMenuOpen((o) => !o)}
              style={({ pressed }) => [styles.langPill, pressed && { opacity: 0.85 }]}
            >
              <GlobeIcon />
              <Text style={styles.langLabel}>{currentLang.label}</Text>
              <ChevronDown />
            </Pressable>
            {menuOpen ? (
              <View style={styles.langMenu}>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <Pressable
                    key={lang.code}
                    onPress={() => pickLanguage(lang.code)}
                    style={({ pressed }) => [
                      styles.langItem,
                      pressed && { backgroundColor: '#f2f7f3' },
                    ]}
                  >
                    <Text style={styles.langItemText}>
                      {lang.flag}  {lang.label}
                    </Text>
                    {i18n.language === lang.code ? (
                      <Text style={styles.langCheck}>✓</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        {/* hero */}
        <Animated.View style={[{ height: heroBoxH, zIndex: 10 }, enterHero]}>
          <View
            style={{
              width: heroW,
              height: HERO_H,
              alignSelf: 'center',
              transform: [{ translateY: -(HERO_H * (1 - scale)) / 2 }, { scale }],
            }}
          >
            {/* sparkles */}
            <View style={{ position: 'absolute', top: 118, left: 10 }}>
              <Sparkle size={12} color="#7cc98a" />
            </View>
            <View style={{ position: 'absolute', top: 64, right: 56 }}>
              <Sparkle size={9} color="#8fd39b" />
            </View>
            <View style={{ position: 'absolute', top: 196, right: 16 }}>
              <Sparkle size={11} color="#7cc98a" />
            </View>
            <View style={{ position: 'absolute', top: 300, left: 14 }}>
              <Sparkle size={9} color="#9bd8a6" />
            </View>
            {/* leaves */}
            <View style={{ position: 'absolute', top: 236, left: 26 }}>
              <Leaf size={30} color="#6fbc71" rotate="-30deg" />
            </View>
            <View style={{ position: 'absolute', top: 352, right: 52 }}>
              <Leaf size={30} color="#63b56a" rotate="130deg" />
            </View>
            <View style={{ position: 'absolute', top: 390, left: 96 }}>
              <Leaf size={22} color="#87c98d" rotate="50deg" />
            </View>

            {/* dish photo — radial fade 66% → 100%, per the design mask */}
            <View style={styles.dishWrap} pointerEvents="none">
              <FadedPhoto id="dish" source={DISH} width={292} height={292} fadeFrom={0.66} />
            </View>
            {/* bottle — natural 165×342 ratio at 102 wide, fade 55% → 98% */}
            <View style={styles.bottleWrap} pointerEvents="none">
              <FadedPhoto id="bottle" source={BOTTLE} width={102} height={211} fadeFrom={0.55} fadeTo={0.98} />
            </View>

            {/* Today Score card */}
            <Animated.View style={[styles.scoreCard, floatScore]}>
              <Text style={styles.cardTitleCenter}>{t('welcome.todayScore')}</Text>
              <View style={{ alignItems: 'center', marginTop: 7 }}>
                <ScoreRing />
              </View>
              <View style={styles.goodJobRow}>
                <View style={styles.goodJobDot}>
                  <Text style={styles.goodJobCheck}>✓</Text>
                </View>
                <Text style={styles.goodJobText}>{t('welcome.goodJob')}</Text>
              </View>
            </Animated.View>

            {/* pulse icon */}
            <Animated.View style={[styles.pulseWrap, floatPulse]}>
              <LinearGradient
                colors={['#63ca70', '#2fb3a6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pulseIcon}
              >
                <PulseLine />
              </LinearGradient>
            </Animated.View>

            {/* Daily Progress card */}
            <Animated.View style={[styles.progressCard, floatProgress]}>
              <Text style={styles.cardTitle}>{t('welcome.dailyProgress')}</Text>
              <View style={{ gap: 8 }}>
                <ProgressRow label={t('welcome.nutrition')} value={85} color="#58c46e" />
                <ProgressRow label={t('welcome.activity')} value={40} color="#4aa3e8" />
                <ProgressRow label={t('welcome.sleep')} value={70} color="#f2c94c" />
              </View>
            </Animated.View>

            {/* Nutrition Balanced tag */}
            <Animated.View style={[styles.nutritionTag, floatTag]}>
              <View style={styles.nutritionTagIcon}>
                <Leaf size={12} color="#3fae62" />
              </View>
              <Text style={styles.nutritionTagText}>{t('welcome.nutritionTag')}</Text>
            </Animated.View>
          </View>
        </Animated.View>

        {/* bottom sheet */}
        <Animated.View style={[styles.sheet, enterSheet]}>
          <View style={styles.leafBadge}>
            <LinearGradient
              colors={['#63ca70', '#2fb3a6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.leafBadgeInner}
            >
              <Leaf size={20} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>

          {/* Twin flex spacers (here and above the features) split any spare
              height evenly, so short locales (ar) don't leave one big blank
              block; with tall locales (fr/de) both collapse to zero. */}
          <View style={{ flex: 1 }} />

          <Pressable
            onPress={start}
            style={({ pressed }) => [
              styles.ctaWrap,
              pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
            ]}
          >
            <LinearGradient
              colors={['#5bc46e', '#2fb3a2']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>{t('welcome.getStarted')}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={login} hitSlop={10}>
            <Text style={styles.loginLink}>{t('welcome.login')}</Text>
          </Pressable>

          <View style={{ flex: 1 }} />

          {/* features */}
          <View style={styles.features}>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#e2f4e6' }]}>
                <TargetIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{t('welcome.track')}</Text>
                <Text style={styles.featureDesc}>{t('welcome.trackDesc')}</Text>
              </View>
            </View>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#e3effc' }]}>
                <BarsIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{t('welcome.improve')}</Text>
                <Text style={styles.featureDesc}>{t('welcome.improveDesc')}</Text>
              </View>
            </View>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#fdf3d9' }]}>
                <TrophyIcon />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{t('welcome.achieve')}</Text>
                <Text style={styles.featureDesc}>{t('welcome.achieveDesc')}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#6e8273',
  shadowOffset: { width: 0, height: 14 },
  shadowOpacity: 0.14,
  shadowRadius: 30,
  elevation: 8,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f7ee' },

  /* language switcher */
  langRow: {
    zIndex: 30,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef1ee',
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
    shadowColor: '#788c78',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  langLabel: { fontFamily: P600, fontSize: 11, color: '#3a4149' },
  langMenu: {
    position: 'absolute',
    top: 38,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef1ee',
    borderRadius: 14,
    padding: 5,
    minWidth: 150,
    shadowColor: '#5a6e5f',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.18,
    shadowRadius: 34,
    elevation: 12,
    zIndex: 40,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  langItemText: { fontFamily: P600, fontSize: 11.5, color: '#3a4149' },
  langCheck: { color: '#2fae8f', fontSize: 11, fontFamily: P700 },

  /* hero */
  dishWrap: {
    position: 'absolute',
    top: 118,
    alignSelf: 'center',
    width: 292,
    height: 292,
  },
  bottleWrap: {
    position: 'absolute',
    top: 126,
    right: 6,
    width: 102,
    height: 211,
  },

  scoreCard: {
    position: 'absolute',
    top: 30,
    left: 20,
    width: 120,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingTop: 11,
    paddingHorizontal: 12,
    paddingBottom: 10,
    ...CARD_SHADOW,
  },
  cardTitleCenter: {
    fontFamily: P600,
    fontSize: 9,
    color: '#6b7770',
    textAlign: 'center',
  },
  ringValue: {
    position: 'absolute',
    fontFamily: P700,
    fontSize: 14,
    color: '#333d44',
  },
  goodJobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f4f1',
  },
  goodJobDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4cb96b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goodJobCheck: { color: '#fff', fontSize: 7, fontWeight: '700', lineHeight: 9 },
  goodJobText: { fontFamily: P600, fontSize: 8.5, color: '#3c4a41' },

  pulseWrap: {
    position: 'absolute',
    top: 44,
    alignSelf: 'center',
    // Same radius as the gradient inside — without it the glow shadow
    // draws around a square box and shows as a pale square halo on web.
    borderRadius: 17,
    shadowColor: '#5ac896',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
  },
  pulseIcon: {
    width: 56,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressCard: {
    position: 'absolute',
    top: 22,
    right: 16,
    width: 126,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    ...CARD_SHADOW,
  },
  cardTitle: { fontFamily: P600, fontSize: 9, color: '#3a4540', marginBottom: 8 },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  progressLabel: { fontFamily: P500, fontSize: 7.5, color: '#8b968f' },
  progressValue: { fontFamily: P500, fontSize: 7.5, color: '#57635c' },
  progressTrack: {
    height: 4,
    borderRadius: 3,
    backgroundColor: '#eff2ef',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  nutritionTag: {
    position: 'absolute',
    top: 326,
    left: 28,
    transform: [{ rotate: '-5deg' }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 9,
    paddingLeft: 9,
    paddingRight: 13,
    ...CARD_SHADOW,
  },
  nutritionTagIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e2f4e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionTagText: {
    fontFamily: P600,
    fontSize: 9.5,
    lineHeight: 12.5,
    color: '#39433c',
  },

  /* bottom sheet */
  sheet: {
    flex: 1,
    zIndex: 20,
    marginTop: -26,
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 30,
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 22,
    paddingBottom: 12,
    shadowColor: '#8ca091',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 40,
    elevation: 10,
  },
  leafBadge: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    // Round the shadow box too, else the glow renders as a square halo.
    borderRadius: 26,
    shadowColor: '#46b48c',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  leafBadgeInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 2,
    fontFamily: P600,
    fontSize: 26,
    lineHeight: 33,
    color: '#37414b',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: P500,
    fontSize: 13,
    lineHeight: 20,
    color: '#98a4ab',
    maxWidth: 330,
    textAlign: 'center',
  },
  ctaWrap: {
    width: '100%',
    maxWidth: 386,
    marginTop: 18,
    borderRadius: 15,
    shadowColor: '#46b482',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 26,
    elevation: 8,
  },
  cta: {
    height: 54,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: P600, fontSize: 16, color: '#fff' },
  loginLink: {
    marginTop: 10,
    fontFamily: P600,
    fontSize: 14,
    color: '#2fae8f',
    padding: 4,
  },

  /* features */
  features: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  feature: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  featureIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontFamily: P600, fontSize: 10, color: '#38424b' },
  featureDesc: {
    fontFamily: P500,
    fontSize: 9,
    lineHeight: 13,
    color: '#a2adb3',
    marginTop: 2,
  },
});
