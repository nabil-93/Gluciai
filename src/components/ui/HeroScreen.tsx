import React from 'react';
import {
  Image,
  ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionGlyph, type ActionGlyphName } from './ActionGlyphs';
import { ChevronLeft } from './icons';

/* ────────────────────────────────────────────────────────────
 * HERO SCREEN — the "Suivi Santé" scaffold.
 *
 * The glucose page established the shape: a photograph bleeding off the top
 * of the screen, dissolved into the canvas by a gradient, with the header
 * floating on it and the content rising out of the fade. Every screen that
 * copied it by hand drifted — a different fade height here, a different
 * header inset there. This is that shape, once.
 *
 * A screen with no photograph of its own gets a colour field with its own
 * glyph blown up behind the fade instead. That is deliberate: inventing a
 * stock photo for "barcode" would say nothing, while the mark the menu
 * already uses for it says exactly what this screen is.
 * ──────────────────────────────────────────────────────────── */

export const HERO_CANVAS = '#F6F9F5';
export const HERO_INK = '#14231C';
export const HERO_MUTED = '#63736A';

const F800 = 'PlusJakartaSans_800ExtraBold';

export function HeroScreen({
  title,
  photo,
  glyph,
  tint,
  gradient,
  height = 250,
  right,
  onClose,
  avoidKeyboard = false,
  contentPadding = 16,
  children,
}: {
  title: string;
  /** A real photograph for this subject, when one exists. */
  photo?: ImageSourcePropType;
  /** Otherwise, the screen's own mark, blown up behind the fade. */
  glyph?: ActionGlyphName;
  /** The screen's colour — drives the field behind a glyph hero. */
  tint?: string;
  /** Override the two-stop field entirely. */
  gradient?: readonly [string, string];
  height?: number;
  right?: React.ReactNode;
  onClose: () => void;
  /** Screens whose main control is a text field lift with the keyboard. */
  avoidKeyboard?: boolean;
  contentPadding?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const heroH = insets.top + height;

  const body = (
    <View style={styles.root}>
      {/* ── Hero ── */}
      <View style={[styles.heroBox, { height: heroH }]} pointerEvents="none">
        {photo ? (
          <Image source={photo} style={[styles.heroImg, { height: heroH }]} resizeMode="cover" />
        ) : (
          <>
            <LinearGradient
              colors={gradient ?? [tintOr(tint, 0.9), tintOr(tint, 0.55)]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.95, y: 1 }}
              style={[styles.heroImg, { height: heroH }]}
            />
            {glyph ? (
              /* Oversized, low, and cropped by the fade — a watermark, not a
                 picture of an icon sitting in the middle of a box. */
              <View style={[styles.motif, { top: insets.top + 4 }]}>
                <ActionGlyph
                  name={glyph}
                  color="#FFFFFF"
                  size={height * 0.86}
                  knockout={tint ?? '#19C37D'}
                />
              </View>
            ) : null}
          </>
        )}

        {/* Dissolve into the canvas so the content has no seam to sit on. */}
        <LinearGradient
          colors={['rgba(246,249,245,0)', 'rgba(246,249,245,0.75)', HERO_CANVAS]}
          locations={[0, 0.55, 0.96]}
          style={[styles.heroFade, { top: heroH - 160, height: 160 }]}
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={[styles.headRow, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={onClose} style={styles.backBtn} accessibilityRole="button">
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.headRight}>{right ?? <View style={{ width: 40 }} />}</View>
        </View>

        {/* The content starts inside the fade, so it reads as rising out of
            the image rather than being parked under it. */}
        <View style={{ paddingHorizontal: contentPadding, marginTop: height - 120 }}>
          {children}
        </View>
      </ScrollView>
    </View>
  );

  return avoidKeyboard ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );
}

/** The tint at a given strength, so one colour makes a two-stop field. */
function tintOr(hex: string | undefined, amount: number): string {
  const base = hex ?? '#19C37D';
  const h = base.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Mix toward white; a flat pair of the same hue reads as a colour swatch.
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: HERO_CANVAS },
  heroBox: { position: 'absolute', top: 0, left: 0, right: 0 },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  heroFade: { position: 'absolute', left: 0, right: 0 },
  motif: {
    position: 'absolute',
    right: -18,
    opacity: 0.22,
  },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1F16',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  headTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F800,
    fontSize: 17,
    color: HERO_INK,
  },
  headRight: { minWidth: 40, alignItems: 'flex-end' },
});
