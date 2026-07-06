import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, typography } from '@/theme';
import { useReduceMotion } from './motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgressRingProps {
  size?: number;
  strokeWidth?: number;
  /** 0..1 */
  progress: number;
  color?: string;
  trackColor?: string;
  label?: string;
  valueText?: string;
  /** Bevel "effort" style: dotted progress arc */
  dashed?: boolean;
  /** Render children in the centre instead of value text */
  children?: React.ReactNode;
  valueColor?: string;
  valueSize?: number;
  /** Animate the arc from 0 to progress on mount */
  animated?: boolean;
  /** Stagger delay (ms) for entrance */
  delay?: number;
}

/**
 * Circular progress ring in the Bevel style. Supports a solid or dotted
 * (dashed) progress arc and an optional dotted track.
 */
export function ProgressRing({
  size = 112,
  strokeWidth = 12,
  progress,
  color = colors.gold,
  trackColor = colors.ringTrack,
  label,
  valueText,
  dashed,
  children,
  valueColor = colors.text,
  valueSize = 25,
  animated = false,
  delay = 0,
}: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  const rm = useReduceMotion();
  const anim = useRef(new Animated.Value(animated && !rm ? 0 : 1)).current;

  useEffect(() => {
    if (!animated || rm) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [animated, rm, clamped, anim, delay]);

  const animatedOffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [c, c * (1 - clamped)],
  });

  // Arc path for the dashed variant (starts at top, sweeps clockwise)
  const sweep = clamped * 360;
  const endAngle = -90 + sweep;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const startX = cx + r * Math.cos(rad(-90));
  const startY = cy + r * Math.sin(rad(-90));
  const endX = cx + r * Math.cos(rad(endAngle));
  const endY = cy + r * Math.sin(rad(endAngle));
  const largeArc = sweep > 180 ? 1 : 0;

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {clamped > 0 &&
            (dashed ? (
              <Path
                d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray="2.5 3.5"
                fill="none"
              />
            ) : (
              <AnimatedCircle
                cx={cx}
                cy={cy}
                r={r}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${c}`}
                strokeDashoffset={animatedOffset}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
        </Svg>
        <View style={styles.center}>
          {children ?? (
            <Text
              style={[
                styles.value,
                { color: valueColor, fontSize: valueSize },
              ]}
            >
              {valueText ?? `${Math.round(clamped * 100)}%`}
            </Text>
          )}
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12 },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.title,
    fontWeight: '750' as any,
  },
  label: {
    fontSize: 16,
    color: '#3E3E44',
  },
});
