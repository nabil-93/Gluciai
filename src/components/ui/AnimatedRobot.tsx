import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useReduceMotion } from './motion';

/**
 * Fully code-drawn animated robot (no raster image → no background
 * box, transparent by nature). Alive by design:
 *  - floats up & down continuously
 *  - blinks every few seconds
 *  - glances left/right once in a while
 *  - hops with a little squash & stretch
 *  - happy: slow head tilt · alert: fast worried shake + raised brows
 */
export function AnimatedRobot({
  size = 90,
  mood = 'happy',
}: {
  size?: number;
  mood?: 'happy' | 'alert';
}) {
  const rm = useReduceMotion();
  const s = size / 90; // scale factor from the 90px reference design

  const float = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current; // eye scaleY
  const look = useRef(new Animated.Value(0)).current; // eyes translateX
  const hop = useRef(new Animated.Value(0)).current; // body translateY
  const squash = useRef(new Animated.Value(0)).current; // body scaleY hint
  const tilt = useRef(new Animated.Value(0)).current; // rotation
  const twinkleA = useRef(new Animated.Value(0.4)).current;
  const twinkleB = useRef(new Animated.Value(0.9)).current;
  const beacon = useRef(new Animated.Value(0)).current; // antenna light pulse

  /* ── Float: gentle continuous hover ── */
  useEffect(() => {
    if (rm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rm, float]);

  /* ── Blink: quick double-ish blink every ~3.4 s ── */
  useEffect(() => {
    if (rm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(3400),
        Animated.timing(blink, { toValue: 0.08, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 110, useNativeDriver: true }),
        Animated.delay(140),
        Animated.timing(blink, { toValue: 0.08, duration: 60, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 120, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rm, blink]);

  /* ── Look around: glance right, hold, glance left, back ── */
  useEffect(() => {
    if (rm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2100),
        Animated.timing(look, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(750),
        Animated.timing(look, { toValue: -1, duration: 320, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(650),
        Animated.timing(look, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(1900),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rm, look]);

  /* ── Hop: a happy little jump with squash & stretch every ~6 s ── */
  useEffect(() => {
    if (rm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(mood === 'alert' ? 3200 : 5600),
        // anticipation squash
        Animated.timing(squash, { toValue: 1, duration: 110, useNativeDriver: true }),
        // jump up + stretch
        Animated.parallel([
          Animated.timing(hop, { toValue: -1, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(squash, { toValue: -1, duration: 200, useNativeDriver: true }),
        ]),
        // land with a bounce
        Animated.parallel([
          Animated.spring(hop, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 14 }),
          Animated.spring(squash, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 12 }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rm, hop, squash, mood]);

  /* ── Tilt: happy sway vs. alert worried shake ── */
  useEffect(() => {
    tilt.setValue(0);
    if (rm) return;
    const loop =
      mood === 'alert'
        ? Animated.loop(
            Animated.sequence([
              Animated.timing(tilt, { toValue: 1, duration: 90, useNativeDriver: true }),
              Animated.timing(tilt, { toValue: -1, duration: 90, useNativeDriver: true }),
              Animated.timing(tilt, { toValue: 1, duration: 90, useNativeDriver: true }),
              Animated.timing(tilt, { toValue: 0, duration: 90, useNativeDriver: true }),
              Animated.delay(900),
            ])
          )
        : Animated.loop(
            Animated.sequence([
              Animated.delay(1400),
              Animated.timing(tilt, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(tilt, { toValue: -1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(tilt, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
          );
    loop.start();
    return () => loop.stop();
  }, [rm, tilt, mood]);

  /* ── Sparkle twinkles (offset rhythms) ── */
  useEffect(() => {
    if (rm) return;
    const mk = (v: Animated.Value, dur: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: dur, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.35, duration: dur, useNativeDriver: true }),
        ])
      );
    const a = mk(twinkleA, 700, 0);
    const b = mk(twinkleB, 900, 450);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [rm, twinkleA, twinkleB]);

  /* ── Antenna beacon: a little light that blinks like a status LED.
        Gentle green pulse when happy, fast urgent flash when alert. ── */
  useEffect(() => {
    if (rm) {
      beacon.setValue(1);
      return;
    }
    const on = mood === 'alert' ? 260 : 720;
    const off = mood === 'alert' ? 260 : 900;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beacon, { toValue: 1, duration: on, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(beacon, { toValue: 0.15, duration: off, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rm, beacon, mood]);

  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -4 * s] });
  const hopY = hop.interpolate({ inputRange: [-1, 0], outputRange: [-9 * s, 0] });
  const bodyScaleY = squash.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [1.08, 1, 0.9],
  });
  const bodyScaleX = squash.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0.94, 1, 1.06],
  });
  const rotate = tilt.interpolate({
    inputRange: [-1, 1],
    outputRange: mood === 'alert' ? ['-3.5deg', '3.5deg'] : ['-6deg', '6deg'],
  });
  const eyesX = look.interpolate({ inputRange: [-1, 1], outputRange: [-3 * s, 3 * s] });

  const eyeColor = mood === 'alert' ? '#ffb020' : '#2ee6a8';
  const eyeH = (mood === 'alert' ? 11 : 15) * s;
  const beaconColor = mood === 'alert' ? '#ff4d4d' : '#2ee6a8';

  return (
    <View style={{ width: size, height: size * 0.97 }} pointerEvents="none">
      <Animated.View
        style={[
          styles.fill,
          {
            transform: [
              { translateY: Animated.add(floatY, hopY) },
              { rotate },
              { scaleX: bodyScaleX },
              { scaleY: bodyScaleY },
            ],
          },
        ]}
      >
        {/* Antenna */}
        <View
          style={[
            styles.antennaStem,
            { width: 3 * s, height: 9 * s, top: 1 * s, borderRadius: 2 * s },
          ]}
        />
        {/* Beacon light — blinks green (happy) / red (alert) like a status LED */}
        <Animated.View
          style={[
            styles.antennaTip,
            {
              width: 9 * s,
              height: 9 * s,
              borderRadius: 5 * s,
              top: -4 * s,
              backgroundColor: beaconColor,
              shadowColor: beaconColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.95,
              shadowRadius: 6 * s,
              opacity: beacon,
            },
          ]}
        />

        {/* Head/body */}
        <View
          style={[
            styles.body,
            {
              width: 72 * s,
              height: 64 * s,
              borderRadius: 32 * s,
              top: 9 * s,
              shadowRadius: 10 * s,
            },
          ]}
        >
          {/* Face screen */}
          <View
            style={[
              styles.face,
              {
                width: 50 * s,
                height: 38 * s,
                borderRadius: 15 * s,
              },
            ]}
          >
            {/* Worried brows (alert only) */}
            {mood === 'alert' ? (
              <>
                <View
                  style={[
                    styles.brow,
                    {
                      width: 12 * s,
                      height: 2.6 * s,
                      left: 7 * s,
                      top: 6 * s,
                      transform: [{ rotate: '18deg' }],
                    },
                  ]}
                />
                <View
                  style={[
                    styles.brow,
                    {
                      width: 12 * s,
                      height: 2.6 * s,
                      right: 7 * s,
                      top: 6 * s,
                      transform: [{ rotate: '-18deg' }],
                    },
                  ]}
                />
              </>
            ) : null}

            {/* Eyes — blink (scaleY) + glance (translateX) */}
            <Animated.View
              style={[styles.eyesRow, { transform: [{ translateX: eyesX }] }]}
            >
              <Animated.View
                style={[
                  styles.eye,
                  {
                    width: 11 * s,
                    height: eyeH,
                    borderRadius: 6 * s,
                    backgroundColor: eyeColor,
                    shadowColor: eyeColor,
                    transform: [{ scaleY: blink }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.eye,
                  {
                    width: 11 * s,
                    height: eyeH,
                    borderRadius: 6 * s,
                    backgroundColor: eyeColor,
                    shadowColor: eyeColor,
                    transform: [{ scaleY: blink }],
                  },
                ]}
              />
            </Animated.View>

            {/* Mouth */}
            <View
              style={[
                mood === 'alert' ? styles.mouthFlat : styles.mouthSmile,
                mood === 'alert'
                  ? { width: 8 * s, height: 2.4 * s, borderRadius: 2 * s }
                  : {
                      width: 10 * s,
                      height: 5 * s,
                      borderBottomLeftRadius: 6 * s,
                      borderBottomRightRadius: 6 * s,
                      borderWidth: 2 * s,
                      borderTopWidth: 0,
                    },
              ]}
            />
          </View>

          {/* Cheek highlight */}
          <View
            style={[
              styles.cheek,
              { width: 8 * s, height: 4 * s, borderRadius: 3 * s, left: 6 * s, bottom: 8 * s },
            ]}
          />
        </View>

        {/* Side ears */}
        <View style={[styles.ear, { width: 6 * s, height: 14 * s, borderRadius: 4 * s, left: -1 * s, top: 32 * s }]} />
        <View style={[styles.ear, { width: 6 * s, height: 14 * s, borderRadius: 4 * s, right: -1 * s, top: 32 * s }]} />

        {/* Twinkling sparkles */}
        <Animated.View style={[styles.sparkA, { opacity: twinkleA, transform: [{ scale: twinkleA }] }]}>
          <Sparkle size={14 * s} color="#ffd75e" />
        </Animated.View>
        <Animated.View style={[styles.sparkB, { opacity: twinkleB, transform: [{ scale: twinkleB }] }]}>
          <Sparkle size={9 * s} color="#ffd75e" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function Sparkle({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z"
        fill={color}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center' },
  antennaStem: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#111827',
    top: 2,
  },
  antennaTip: {
    position: 'absolute',
    alignSelf: 'center',
  },
  body: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8ebf5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#556',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    elevation: 4,
  },
  face: {
    backgroundColor: '#0f1220',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyesRow: { flexDirection: 'row', gap: 9 },
  eye: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
  brow: { position: 'absolute', backgroundColor: '#ffffff' },
  mouthSmile: {
    marginTop: 3,
    borderColor: '#2ee6a8',
    backgroundColor: 'transparent',
  },
  mouthFlat: { marginTop: 4, backgroundColor: '#ffb020' },
  cheek: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  ear: { position: 'absolute', backgroundColor: '#dfe3f0' },
  sparkA: { position: 'absolute', right: -2, top: 6 },
  sparkB: { position: 'absolute', left: 0, bottom: 4 },
});
