/**
 * THE GLASSES — what "drink 580 ml" looks like when you can see it.
 *
 * A row of glasses: whole ones filled, then the LAST one filled only as far as
 * the remainder goes. That partial fill is the point of the component. 80 ml
 * left is a third of a glass, and drawing it as a full one would quietly tell
 * the patient to drink 170 ml more than they need.
 *
 * The arithmetic is not here. `services/nutrition/hydration` decides how many
 * glasses and how full the last one is; this file only draws the answer, so the
 * numbers can be tested without a renderer.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const F600 = 'PlusJakartaSans_600SemiBold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const WATER = '#4da3f5';
const WATER_SOFT = '#bcdcfb';
const GLASS_EDGE = '#dde5ee';
const GLASS_BODY = '#f3f7fc';

/** Drawn size of one glass. Tuned to fit eight across a narrow phone card. */
const W = 26;
const H = 34;

/** How much of the glass the water may occupy — the rim is never submerged. */
const FILL_MAX = 0.86;

/**
 * A single glass, filled `fill` (0..1) of the way up.
 *
 * Built from plain Views rather than SVG: the shape is a rounded tumbler and
 * the fill is a rectangle pinned to its bottom, which `overflow: hidden` does
 * exactly and cheaply. One less renderer in a card that already draws a ring.
 */
function Glass({ fill }: { fill: number }) {
  const clamped = Math.max(0, Math.min(1, fill));
  const height = Math.round(H * FILL_MAX * clamped);
  return (
    <View style={styles.glass}>
      {height > 0 && (
        <View
          style={[
            styles.water,
            { height },
            // A part-filled glass is drawn a shade softer than a full one, so
            // "nearly done" reads at a glance without counting.
            clamped < 1 && { backgroundColor: WATER_SOFT },
          ]}
        />
      )}
    </View>
  );
}

export function WaterGlasses({
  full,
  partial,
  glassMl,
  /** Cap on how many are drawn; beyond it the rest are summarised. */
  maxDrawn = 8,
  perGlassLabel,
}: {
  /** Glasses to fill completely. */
  full: number;
  /** Fill of the next glass, 0..1. Zero when the remainder is a whole number. */
  partial: number;
  /** Millilitres one glass holds — shown, so the count means something. */
  glassMl: number;
  maxDrawn?: number;
  /** e.g. "250 mL per glass", already translated by the caller. */
  perGlassLabel?: string;
}) {
  const wholes = Math.max(0, Math.floor(full));
  const hasPartial = partial > 0 && partial < 1;

  // Nothing to drink: draw nothing rather than a row of empty glasses, which
  // would read as a target the patient has failed to meet.
  if (wholes === 0 && !hasPartial) return null;

  const drawnWholes = Math.min(wholes, maxDrawn);
  const overflow = wholes - drawnWholes;
  const showPartial = hasPartial && drawnWholes + 1 <= maxDrawn && overflow === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {Array.from({ length: drawnWholes }, (_, i) => (
          <Glass key={`f${i}`} fill={1} />
        ))}
        {showPartial && <Glass key="p" fill={partial} />}
        {overflow > 0 && <Text style={styles.overflow}>+{overflow}</Text>}
      </View>
      {perGlassLabel ? <Text style={styles.perGlass}>{perGlassLabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 5 },
  row: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'center', gap: 5 },
  glass: {
    width: W,
    height: H,
    // A tumbler: slightly rounded, a touch narrower at the base.
    borderRadius: 6,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderWidth: 1.4,
    borderColor: GLASS_EDGE,
    backgroundColor: GLASS_BODY,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  water: {
    backgroundColor: WATER,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },
  overflow: { fontSize: 11, fontFamily: F800, color: WATER, alignSelf: 'center' },
  perGlass: { fontSize: 9.5, fontFamily: F600, color: '#9aa8b6' },
});
