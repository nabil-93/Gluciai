import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Shared animation primitives — all use the native driver (60 fps on
 * the UI thread) and respect the OS "Reduce Motion" setting.
 */

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.()
  .then((v) => (reduceMotion = v))
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => {
  reduceMotion = v;
});

export function useReduceMotion() {
  const [value, setValue] = useState(reduceMotion);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => mounted && setValue(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (v) => mounted && setValue(v)
    );
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return value;
}

/* ── FadeInView: fade + rise, optional stagger delay ── */
export function FadeInView({
  children,
  delay = 0,
  distance = 12,
  duration = 380,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const rm = useReduceMotion();
  const progress = useRef(new Animated.Value(rm ? 1 : 0)).current;

  useEffect(() => {
    if (rm) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [rm, progress, delay, duration]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/* ── PressableScale: subtle scale + haptic on press ── */
export function PressableScale({
  children,
  onPress,
  style,
  containerStyle,
  scaleTo = 0.97,
  haptic = true,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
  onLayout,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Applied to the outer Pressable — use for flex sizing in rows */
  containerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
  /** Layout of the inner (styled) card view. */
  onLayout?: React.ComponentProps<typeof Animated.View>['onLayout'];
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const rm = useReduceMotion();

  const to = (v: number) =>
    Animated.spring(scale, {
      toValue: v,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={containerStyle}
      onPressIn={() => !rm && to(scaleTo)}
      onPressOut={() => !rm && to(1)}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
      }}
    >
      <Animated.View
        style={[style, { transform: [{ scale }] }]}
        onLayout={onLayout}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ── AnimatedCounter: counts up to a value on mount / change ── */
export function AnimatedCounter({
  value,
  duration = 700,
  style,
  format = (n) => String(Math.round(n)),
}: {
  value: number;
  duration?: number;
  style?: any;
  format?: (n: number) => string;
}) {
  const rm = useReduceMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(() => format(rm ? value : 0));
  const prev = useRef(0);

  useEffect(() => {
    if (rm) {
      setDisplay(format(value));
      prev.current = value;
      return;
    }
    anim.setValue(0);
    const from = prev.current;
    const id = anim.addListener(({ value: t }) => {
      setDisplay(format(from + (value - from) * t));
    });
    const a = Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // JS listener needs non-native
    });
    a.start(() => (prev.current = value));
    return () => {
      anim.removeListener(id);
      a.stop();
    };
  }, [value, rm, anim, duration, format]);

  return <Text style={style}>{display}</Text>;
}

/* ── Shimmer skeleton block ── */
export function Skeleton({
  width,
  height,
  radius = 12,
  style,
}: {
  width?: number | string;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const rm = useReduceMotion();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rm) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rm, shimmer]);

  return (
    <View
      style={[
        {
          width: width as any,
          height,
          borderRadius: radius,
          backgroundColor: '#E9E9EE',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {!rm ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#F2F2F6',
              opacity: shimmer.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.2, 0.7, 0.2],
              }),
            },
          ]}
        />
      ) : null}
    </View>
  );
}
