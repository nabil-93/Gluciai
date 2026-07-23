import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#20bf6b';
const GREEN_D = '#159A57';
const INK = '#1e2a23';
const MUTED = '#8a988f';

/** How long the auto-redirect bar takes to fill before going home. */
const REDIRECT_MS = 5000;

/**
 * Confirmation window shown right after the patient saves a scanned meal.
 * Tells them the plate is safely in their journal, then a progress bar fills
 * over 5 s and auto-redirects home — or they tap "Go to home" to leave now.
 * `onDone` fires exactly once (bar completes OR button pressed).
 */
export function SaveConfirmModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);
  // Keep the latest onDone without making it an effect dependency, so a parent
  // re-render while the window is open never restarts the 5 s countdown.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!open) return;
    doneRef.current = false;
    progress.setValue(0);
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDoneRef.current();
    };
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: REDIRECT_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) finish();
    });
    return () => anim.stop();
  }, [open, progress]);

  const goNow = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    progress.stopAnimation();
    onDoneRef.current();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={goNow}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.checkWrap}>
            <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 6 9 17l-5-5" />
            </Svg>
          </View>

          <Text style={styles.title}>{t('analysis.savedTitle')}</Text>
          <Text style={styles.body}>{t('analysis.savedBody')}</Text>

          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width }]} />
          </View>
          <Text style={styles.redirect}>{t('analysis.savedRedirect')}</Text>

          <Pressable style={styles.btn} onPress={goNow}>
            <Text style={styles.btnText}>{t('analysis.savedGoHome')}</Text>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m9 18 6-6-6-6" />
            </Svg>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 26,
    paddingVertical: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  checkWrap: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  title: { fontFamily: F800, fontSize: 19, color: INK, textAlign: 'center' },
  body: {
    fontFamily: F500,
    fontSize: 13.5,
    lineHeight: 19,
    color: '#5a655d',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 99,
    backgroundColor: '#e9efe9',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 99, backgroundColor: GREEN },
  redirect: { fontFamily: F600, fontSize: 11.5, color: MUTED, marginTop: 9, marginBottom: 18 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    alignSelf: 'stretch',
    backgroundColor: GREEN_D,
    borderRadius: 15,
    paddingVertical: 14,
  },
  btnText: { fontFamily: F800, fontSize: 14.5, color: '#fff' },
});
