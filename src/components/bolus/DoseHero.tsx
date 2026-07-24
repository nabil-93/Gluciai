import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { useReduceMotion } from '@/components/ui';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const HERO = require('../../assets/insulin/hero-bg.jpg');

/**
 * The result hero for the insulin-dose calculator: the recommended dose shown
 * over the real insulin-pen photo, so the number reads as a prescription card
 * rather than a plain figure. The dose counts up on reveal (a moment of "the
 * AI is landing on the number"), sitting inside a soft glow.
 *
 * Hypo case: no number is shown at all — a red-washed hero with a warning
 * mark, because the safe action is to TREAT the low, never to inject.
 */
export function DoseHero({
  dose,
  unit,
  label,
  hypoLabel,
  injectLine,
  isHypo,
  format,
}: {
  dose: number;
  unit: string;
  label: string;
  hypoLabel: string;
  injectLine?: string | null;
  isHypo: boolean;
  /** Locale-aware number formatting from the screen (0.1 U precision). */
  format: (v: number) => string;
}) {
  const reduceMotion = useReduceMotion();

  // Entrance: the whole hero fades up once.
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  // The glow behind the number breathes in.
  const glow = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  // The counted-up number the patient reads.
  const [shown, setShown] = useState(reduceMotion || isHypo ? dose : 0);

  useEffect(() => {
    if (reduceMotion) {
      setShown(dose);
      return;
    }
    enter.setValue(0);
    glow.setValue(0);
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Count-up is a text value, so it can't ride the native driver — drive it
    // off a short JS timer instead (one-shot, ~34 frames, cheap).
    if (isHypo || dose <= 0) {
      setShown(dose);
      return;
    }
    const steps = 22;
    let i = 0;
    setShown(0);
    const id = setInterval(() => {
      i += 1;
      const p = i / steps;
      // ease-out so it decelerates onto the final value
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(i >= steps ? dose : Math.round(dose * eased * 10) / 10);
      if (i >= steps) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [dose, isHypo, reduceMotion, enter, glow]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Animated.View style={[styles.wrap, { opacity: enter, transform: [{ translateY }] }]}>
      <Image source={HERO} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      {/* Legibility wash — teal→ink to match the pen photo (red for a hypo). */}
      <LinearGradient
        colors={
          isHypo
            ? ['rgba(120,20,18,0.78)', 'rgba(60,10,10,0.94)']
            : ['rgba(11,58,74,0.68)', 'rgba(8,24,32,0.94)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.inner}>
        <View style={styles.labelPill}>
          <Text style={styles.labelText}>{isHypo ? `⚠️ ${hypoLabel}` : `✨ ${label}`}</Text>
        </View>

        {isHypo ? (
          <Text style={styles.hypoMark}>🛑</Text>
        ) : (
          <View style={styles.doseWrap}>
            {/* Soft glow puck behind the number */}
            <Animated.View
              style={[styles.glow, { opacity: glow, transform: [{ scale: glowScale }] }]}
              pointerEvents="none"
            />
            <View style={styles.doseRow}>
              <Text style={styles.doseValue} allowFontScaling={false}>
                {format(shown)}
              </Text>
              <Text style={styles.doseUnit}>{unit}</Text>
            </View>
          </View>
        )}

        {!isHypo && injectLine ? (
          <View style={styles.injectPill}>
            <Text style={styles.injectText} numberOfLines={1}>
              {injectLine}
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 244,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#0b3a4a',
    shadowColor: '#0b2530',
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },

  labelPill: {
    position: 'absolute',
    top: 18,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  labelText: { fontFamily: F700, fontSize: 12, color: '#EAF6FF', letterSpacing: 0.2 },

  doseWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(55,222,115,0.34)',
    // A single soft puck reads as a glow behind the number.
    shadowColor: '#37DE73',
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  doseRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  doseValue: {
    fontFamily: F800,
    fontSize: 76,
    color: '#ffffff',
    letterSpacing: -2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 14,
  },
  doseUnit: { fontFamily: F700, fontSize: 26, color: 'rgba(255,255,255,0.82)' },

  hypoMark: { fontSize: 66, marginVertical: 8 },

  injectPill: {
    position: 'absolute',
    bottom: 18,
    maxWidth: '90%',
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  injectText: { fontFamily: F600, fontSize: 12.5, color: '#EAF6FF' },
});
