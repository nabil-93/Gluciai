import React, { createContext, useContext, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Shared tab-bar visibility value (0 = hidden, 1 = shown).
 * Screens call `useTabBarScroll().onScroll` on their ScrollView; the
 * tab bar reads `visible` to slide itself away on scroll-down and back
 * on scroll-up — a native-driver spring, no re-renders.
 */
interface Ctx {
  visible: Animated.Value;
  onScroll: (e: {
    nativeEvent: { contentOffset: { y: number } };
  }) => void;
  /** Force the bar expanded (e.g. tapping the compact pill) */
  expand: () => void;
}

const TabBarContext = createContext<Ctx | null>(null);

export function TabBarVisibilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const visible = useRef(new Animated.Value(1)).current;
  const lastY = useRef(0);
  const shown = useRef(true);

  const setShown = (next: boolean) => {
    if (shown.current === next) return;
    shown.current = next;
    Animated.spring(visible, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 4,
    }).start();
  };

  const onScroll = (e: {
    nativeEvent: { contentOffset: { y: number } };
  }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    // Ignore tiny jitter and bounce at the top
    if (y < 40) {
      setShown(true);
    } else if (dy > 6) {
      setShown(false); // scrolling down → hide
    } else if (dy < -6) {
      setShown(true); // scrolling up → show
    }
    lastY.current = y;
  };

  return (
    <TabBarContext.Provider
      value={{ visible, onScroll, expand: () => setShown(true) }}
    >
      {children}
    </TabBarContext.Provider>
  );
}

export function useTabBarScroll() {
  const ctx = useContext(TabBarContext);
  // No-op fallback outside the provider (e.g. non-tab screens)
  if (!ctx) {
    return {
      visible: new Animated.Value(1),
      onScroll: () => {},
      expand: () => {},
    };
  }
  return ctx;
}
