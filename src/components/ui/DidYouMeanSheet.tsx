import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { FoodItemResult } from '@/types';
import { colors } from '@/theme';

/**
 * "Did you mean?" bottom sheet for a low-confidence detection (<70%).
 * Lets the user pick the correct food from the model's alternatives (or
 * keep the original). Presentation only — the parent applies the choice
 * (re-resolve nutrition + save the correction). No AI is called.
 */
export function DidYouMeanSheet({
  item,
  visible,
  onConfirm,
  onDismiss,
}: {
  item: FoodItemResult | null;
  visible: boolean;
  /** Called with the chosen search name (the original name = keep). */
  onConfirm: (choice: string) => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  /** The user's explicit pick; `null` = default. The DEFAULT is derived,
   *  so no setState-in-effect is needed to refresh it. */
  const [picked, setPicked] = useState<string | null>(null);

  const original = item?.name ?? '';
  const options = item?.alternatives ?? [];

  // A new item (or a re-open) discards the previous pick — adjusted
  // during render, the official React "previous renders" pattern.
  const [prev, setPrev] = useState<{
    item: FoodItemResult | null;
    visible: boolean;
  }>({ item: null, visible: false });
  if (item !== prev.item || visible !== prev.visible) {
    setPrev({ item, visible });
    setPicked(null);
  }

  const choice = picked ?? item?.search_name ?? original;
  const setChoice = setPicked;

  useEffect(() => {
    if (visible) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(600);
    }
  }, [visible, translateY]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + 16, transform: [{ translateY }] },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.title}>{t('result.didYouMean')}</Text>
        <Text style={styles.hint}>{t('result.lowConfidenceHint')}</Text>

        <View style={styles.options}>
          {/* Keep the original detection */}
          <Option
            label={t('result.keepOriginal', { food: original })}
            selected={choice === (item.search_name ?? original)}
            onPress={() => setChoice(item.search_name ?? original)}
          />
          {options.map((alt) => (
            <Option
              key={alt}
              label={alt}
              capitalize
              selected={choice === alt}
              onPress={() => setChoice(alt)}
            />
          ))}
        </View>

        <Pressable
          style={styles.confirm}
          onPress={() => choice && onConfirm(choice)}
        >
          <Text style={styles.confirmText}>{t('result.confirm')}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function Option({
  label,
  selected,
  onPress,
  capitalize,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  capitalize?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <Text
        style={[
          styles.optionLabel,
          capitalize && styles.capitalize,
          selected && styles.optionLabelSelected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,10,14,0.5)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  hint: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  options: { marginTop: 16, gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.surface2,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}0F`,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  optionLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  optionLabelSelected: { color: colors.primary, fontWeight: '700' },
  capitalize: { textTransform: 'capitalize' },
  confirm: {
    marginTop: 18,
    borderRadius: 16,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});
