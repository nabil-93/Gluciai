import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FoodItemResult } from '@/types';
import { colors } from '@/theme';

/**
 * Draws one labelled rectangle per detected food on top of the meal photo,
 * like Cal AI / Foodvisor. Coordinates from the vision model are in the
 * ORIGINAL image's pixel space; we scale them to the rendered frame using
 * the image's intrinsic size (`natural`) vs its on-screen size (`layout`).
 *
 * Tapping a box calls `onSelect(index)` so the result screen can scroll to
 * and highlight that food's card. Purely presentational — no business logic.
 */
export function BoundingBoxOverlay({
  items,
  natural,
  layout,
  selectedIndex,
  onSelect,
  fit = 'cover',
}: {
  items: FoodItemResult[];
  /** Intrinsic image size in px (from expo-image onLoad). */
  natural: { width: number; height: number } | null;
  /** On-screen size of the image frame in px (from onLayout). */
  layout: { width: number; height: number } | null;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Must match the Image's contentFit so boxes land on the pixels. */
  fit?: 'cover' | 'contain';
}) {
  if (!natural || !layout || natural.width <= 0 || natural.height <= 0) {
    return null;
  }

  // Boxes are 0-1 FRACTIONS of the original image. Reproduce the Image's
  // contentFit transform so each fraction lands on the right pixels:
  //  • cover   → fills frame, center-cropped (scale = max)
  //  • contain → whole image fits, letterboxed (scale = min)
  const scale = (fit === 'contain' ? Math.min : Math.max)(
    layout.width / natural.width,
    layout.height / natural.height
  );
  const dispW = natural.width * scale; // displayed image size (may exceed frame)
  const dispH = natural.height * scale;
  const offsetX = (layout.width - dispW) / 2; // negative = cropped sides
  const offsetY = (layout.height - dispH) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {items.map((it, i) => {
        const b = it.bounding_box;
        if (!b) return null;
        // fraction → pixels on the displayed image → shift by crop offset
        const left = offsetX + b.x * dispW;
        const top = offsetY + b.y * dispH;
        const width = b.width * dispW;
        const height = b.height * dispH;

        // Skip boxes that fall entirely outside the visible (cropped) frame.
        if (
          left + width < 0 ||
          top + height < 0 ||
          left > layout.width ||
          top > layout.height
        ) {
          return null;
        }

        const selected = selectedIndex === i;
        const color = selected ? colors.primary : '#FFFFFF';
        return (
          <Pressable
            key={`${it.name}-${i}`}
            onPress={() => onSelect(i)}
            style={[
              styles.box,
              {
                left,
                top,
                width,
                height,
                borderColor: color,
                borderWidth: selected ? 3 : 2,
                backgroundColor: selected
                  ? 'rgba(25,195,125,0.18)'
                  : 'rgba(0,0,0,0.04)',
              },
            ]}
          >
            <View
              style={[
                styles.label,
                { backgroundColor: selected ? colors.primary : 'rgba(10,10,14,0.72)' },
              ]}
            >
              <Text style={styles.labelText} numberOfLines={1}>
                {it.name} ({Math.round(it.detection_confidence * 100)}%)
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    borderRadius: 10,
  },
  label: {
    position: 'absolute',
    top: -2,
    left: -2,
    maxWidth: 200,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  labelText: {
    color: '#fff',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
