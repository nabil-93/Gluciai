import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

const F600 = 'PlusJakartaSans_600SemiBold';

/**
 * Full-screen viewer for a meal photo.
 *
 * Every place the app shows a scanned meal shows it at thumbnail size — 62 px
 * on the home recap, a header strip on the analysis page. That is fine for
 * recognising the meal and useless for checking it: whether the whole plate is
 * in frame, whether the AI read the right dish, what the portion actually
 * looked like. Tapping the photo opens it here, uncropped, so the patient can
 * verify against the numbers the app is about to dose from.
 *
 * `contain`, never `cover`: this is the image the vision model was given, and
 * cropping it here would hide exactly the edges worth checking.
 */
export function ImageLightbox({
  uri,
  visible,
  onClose,
  caption,
}: {
  uri?: string | null;
  visible: boolean;
  onClose: () => void;
  caption?: string;
}) {
  const { t } = useTranslation();
  if (!uri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Android: without this the status bar stays light over a black backdrop.
      statusBarTranslucent
    >
      {/* The backdrop is the close affordance — the usual gesture for a photo
          viewer — with an explicit button for anyone who does not know that. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="contain"
          transition={120}
          accessibilityLabel={caption ?? t('analysis.mealPhoto')}
        />
        {caption ? (
          <Text style={styles.caption} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        style={styles.close}
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
          <Path d="M18 6 6 18M6 6l12 12" />
        </Svg>
      </Pressable>
    </Modal>
  );
}

/** Wraps a thumbnail so it reads as tappable and opens the viewer. */
export function ZoomableThumb({
  children,
  onPress,
  style,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label ?? t('common.viewPhoto')}
    >
      {children}
      {/* Small magnifier badge: without it nothing says the photo is tappable. */}
      <View style={styles.badge} pointerEvents="none">
        <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
          <Path d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM21 21l-4.3-4.3M11 8v6M8 11h6" />
        </Svg>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  image: { width: '100%', height: '82%' },
  caption: {
    marginTop: 14,
    color: '#E6EAF0',
    fontFamily: F600,
    fontSize: 13,
    textAlign: 'center',
  },
  close: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 18 : 52,
    right: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    // Inset enough to clear a rounded thumbnail's corner clip (a 62 px tile
    // with a 16 px radius eats anything closer than ~5 px to the corner).
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(10,14,20,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
