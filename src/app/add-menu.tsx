import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityGlyph, CloseGlyph } from '@/components/ui';
import { colors, shadows } from '@/theme';

function ScanGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"
        stroke="#fff"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      <Circle cx={12} cy={12} r={3.2} stroke="#fff" strokeWidth={2} fill="none" />
    </Svg>
  );
}
function DropGlyph({ color = colors.glucoseInRange }: { color?: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M12 3s6 6.6 6 11a6 6 0 11-12 0c0-4.4 6-11 6-11z"
        fill={color}
      />
    </Svg>
  );
}
function SyringeGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M18 6l-9.5 9.5M14 4l6 6M19 3l2 2M8 14l2 2M5 17l-2 4 4-2 1-3-3 1z"
        stroke={colors.ai}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function ScaleGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={16} height={16} rx={4} stroke={colors.protein} strokeWidth={2} fill="none" />
      <Path d="M9 9a3 3 0 016 0" stroke={colors.protein} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
function GridGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={7} height={7} rx={2} fill={colors.carbs} />
      <Rect x={13} y={4} width={7} height={7} rx={2} fill={colors.carbs} opacity={0.55} />
      <Rect x={4} y={13} width={7} height={7} rx={2} fill={colors.carbs} opacity={0.55} />
      <Rect x={13} y={13} width={7} height={7} rx={2} fill={colors.carbs} />
    </Svg>
  );
}
function LabGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M9 3h6M10 3v6.5L4.8 18a2 2 0 001.7 3h11a2 2 0 001.7-3L14 9.5V3"
        stroke="#8a3ffc"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M7.5 15h9" stroke="#8a3ffc" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

interface Item {
  label: string;
  href: Href;
  gradient?: boolean;
  icon: React.ReactNode;
}

const ITEMS: Item[] = [
  { label: 'Scanner un repas', href: '/scan', gradient: true, icon: <ScanGlyph /> },
  { label: 'Glycémie', href: '/log-glucose', icon: <DropGlyph /> },
  { label: 'Insuline', href: '/log-insulin', icon: <SyringeGlyph /> },
  { label: 'Calculateur de bolus', href: '/bolus', icon: <GridGlyph /> },
  {
    label: 'Cuisine marocaine',
    href: '/foods',
    icon: <Text style={{ fontSize: 24 }}>🇲🇦</Text>,
  },
  {
    label: 'Code-barres',
    href: '/barcode',
    icon: <Text style={{ fontSize: 22 }}>🏷️</Text>,
  },
  {
    label: 'Menu restaurant',
    href: '/menu-scan',
    icon: <Text style={{ fontSize: 22 }}>📋</Text>,
  },
  {
    label: 'Activité',
    href: '/(tabs)/activity',
    icon: <ActivityGlyph size={24} color={colors.primary} />,
  },
  { label: 'Poids & mesures', href: '/(tabs)/biology', icon: <ScaleGlyph /> },
  { label: 'Mes analyses', href: '/labs', icon: <LabGlyph /> },
  {
    label: 'Rapport médecin',
    href: '/report',
    icon: <Text style={{ fontSize: 22 }}>📄</Text>,
  },
  {
    label: 'Urgence SOS',
    href: '/emergency',
    icon: <Text style={{ fontSize: 22 }}>🚨</Text>,
  },
];

export default function AddMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const open = (href: Href) => {
    close();
    // Let the modal close before pushing the next screen
    setTimeout(() => router.push(href), 80);
  };

  return (
    <View style={styles.overlay}>
      <BlurView
        intensity={18}
        tint="light"
        style={StyleSheet.absoluteFill}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      <View style={[styles.sheet, { bottom: Math.max(insets.bottom, 12) + 96 }]}>
        <View style={styles.grid}>
          {ITEMS.map((item) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
              onPress={() => open(item.href)}
            >
              {item.gradient ? (
                <LinearGradient
                  colors={['#B9C7F5', '#7C8EE8', '#A78BF0']}
                  start={{ x: 0.2, y: 0.2 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.itemIconGradient}
                >
                  {item.icon}
                </LinearGradient>
              ) : (
                <View style={styles.itemIcon}>{item.icon}</View>
              )}
              <Text style={styles.itemLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={close}
        style={[styles.closeBtn, { bottom: Math.max(insets.bottom, 10) + 14 }]}
      >
        <CloseGlyph size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,20,30,0.12)',
  },
  sheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: '#F7F7F9',
    borderRadius: 32,
    paddingVertical: 22,
    paddingHorizontal: 16,
    ...shadows.floating,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  item: {
    width: '33.33%',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  itemIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  itemIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  itemLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 16,
  },
  closeBtn: {
    position: 'absolute',
    right: 12,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
});
