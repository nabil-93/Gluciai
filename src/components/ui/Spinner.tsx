import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/**
 * Branded loading spinner: a faint circular track with a rotating
 * "comet" arc (rounded cap). Drop-in wherever a save / send / fetch is
 * in flight so the user knows to wait. Defaults to the GluciAI green;
 * pass `color="#fff"` on filled buttons.
 */
export function Spinner({
  size = 20,
  color = '#19C37D',
  thickness,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const sw = thickness ?? Math.max(2, Math.round(size * 0.14));
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        // Native driver has no effect on web (falls back to JS timers).
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;

  return (
    <Animated.View
      style={{ width: size, height: size, transform: [{ rotate }] }}
      accessibilityRole="progressbar"
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeOpacity={0.22}
          strokeWidth={sw}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={sw}
          fill="none"
          strokeDasharray={`${c * 0.3} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}
