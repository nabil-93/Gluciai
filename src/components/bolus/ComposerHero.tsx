import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { AnimatedRobot, useReduceMotion } from '@/components/ui';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const HERO = require('../../assets/insulin/hero-bg.jpg');

/**
 * The opening banner of the dose composer (the INPUT screen). It mirrors the
 * result page's DoseHero — same insulin-pen photo, same rounded teal card — so
 * entering the numbers and reading the dose feel like two halves of one flow.
 *
 * The robot floats on a transparent wrapper (no chip) and greets the patient
 * while they fill in the meal + glucose.
 */
export function ComposerHero({
  pill,
  title,
  subtitle,
}: {
  pill: string;
  title: string;
  subtitle: string;
}) {
  const reduceMotion = useReduceMotion();

  // Entrance: the banner fades up once on mount.
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter, reduceMotion]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View style={[styles.wrap, { opacity: enter, transform: [{ translateY }] }]}>
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />

      {/* Vertical wash so the headline at the bottom stays readable while the
          pen photo keeps its glossy teal highlight up top. */}
      <LinearGradient
        colors={['rgba(9,46,60,0.30)', 'rgba(8,32,42,0.72)', 'rgba(7,22,29,0.95)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.2, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Pill top-left */}
      <View style={styles.pill}>
        <Text style={styles.pillText}>✨ {pill}</Text>
      </View>

      {/* Floating mascot — transparent, no chip */}
      <View style={styles.robotWrap} pointerEvents="none">
        <View style={styles.robotGlow} />
        <AnimatedRobot size={78} mood="happy" />
      </View>

      {/* Headline block, bottom-left */}
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 180,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#0b3a4a',
    shadowColor: '#0b2530',
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 9,
  },

  pill: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  pillText: { fontFamily: F700, fontSize: 11.5, color: '#EAF6FF', letterSpacing: 0.2 },

  robotWrap: {
    position: 'absolute',
    top: 22,
    right: 16,
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotGlow: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(55,222,115,0.22)',
    shadowColor: '#37DE73',
    shadowOpacity: 0.8,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },

  textBlock: { position: 'absolute', left: 18, right: 18, bottom: 16 },
  title: {
    fontFamily: F800,
    fontSize: 23,
    color: '#ffffff',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.30)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  sub: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(233,246,255,0.88)',
    marginTop: 4,
    maxWidth: '82%',
  },
});
