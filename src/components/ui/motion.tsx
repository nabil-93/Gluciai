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

/* ── GaugeRing: animated circular gauge, value in the middle ── */
import Svg, { Circle } from 'react-native-svg';

/** Animated adds `collapsable={false}`, which react-native-svg forwards to
 *  the DOM <circle> on web and React warns about — strip it. */
const CircleSansCollapsable = React.forwardRef<any, any>(function CircleSansCollapsable(
  { collapsable: _collapsable, ...rest },
  ref
) {
  return <Circle ref={ref} {...rest} />;
});
const AnimatedCircle = Animated.createAnimatedComponent(CircleSansCollapsable);

/**
 * Circular gauge whose colored arc sweeps in on mount — the value sits
 * INSIDE the ring. `progress` is 0..1 of the circumference (e.g. share
 * of a daily reference). Used by the food detail nutrition rings and
 * the labs charts.
 */
export function GaugeRing({
  size = 88,
  stroke = 9,
  progress,
  color,
  value,
  unit,
  label,
  delay = 0,
}: {
  size?: number;
  stroke?: number;
  /** 0..1 — how much of the ring is filled. */
  progress: number;
  color: string;
  /** Big text shown in the middle of the ring. */
  value: string;
  /** Small unit line under the value (e.g. "kcal", "g"). */
  unit?: string;
  /** Caption under the ring. */
  label?: string;
  delay?: number;
}) {
  const rm = useReduceMotion();
  const target = Math.min(1, Math.max(0.035, progress));
  const anim = useRef(new Animated.Value(rm ? target : 0)).current;

  useEffect(() => {
    if (rm) {
      anim.setValue(target);
      return;
    }
    const a = Animated.timing(anim, {
      toValue: target,
      duration: 950,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG props can't ride the native driver
    });
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, rm]);

  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const dashOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [C, 0],
  });

  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeOpacity={0.13}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${C}`}
            strokeDashoffset={dashOffset as unknown as number}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text
              style={{
                fontFamily: 'PlusJakartaSans_800ExtraBold',
                fontSize: size >= 84 ? 16 : 13.5,
                color: '#111827',
              }}
            >
              {value}
            </Text>
            {unit ? (
              <Text
                style={{
                  fontFamily: 'PlusJakartaSans_600SemiBold',
                  fontSize: 9,
                  color: '#8b93a7',
                  marginTop: 1,
                }}
              >
                {unit}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      {label ? (
        <Text
          style={{
            fontFamily: 'PlusJakartaSans_600SemiBold',
            fontSize: 10.5,
            color: '#5b6472',
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
