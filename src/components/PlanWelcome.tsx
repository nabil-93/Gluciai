import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { useAppStore } from '@/store/useAppStore';

const SUPPORT_WA = '491637606478';

function WhatsAppIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Z" fill="#ffffff" />
      <Path
        d="M8.5 7.3c-.2-.4-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.9 4.5 3.9 2.2.9 2.7.7 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.2-.2-.5-.3l-1.6-.8c-.2-.1-.4-.1-.6.1l-.6.8c-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5c.1-.1.1-.3.2-.4 0-.1 0-.3 0-.4l-.5-1.4Z"
        fill="#1fbc78"
      />
    </Svg>
  );
}

/**
 * First-run welcome for free-plan patients: explains they're on the free
 * plan and how to unlock everything via support. Shown once (persisted
 * flag), after the wizard, on the first tabs mount.
 */
export function PlanWelcome() {
  const { t } = useTranslation();
  const shown = useAppStore((s) => s.planWelcomeShown);
  const wizardDone = useAppStore((s) => s.wizardDone);
  const lockedFeatures = useAppStore((s) => s.lockedFeatures);
  const mark = useAppStore((s) => s.markPlanWelcomeShown);
  const [visible, setVisible] = React.useState(false);

  // Free plan = at least one feature is locked from the dashboard. New
  // accounts start fully locked, so they see this; a fully-unlocked
  // (paying) patient never does.
  const isFreePlan = lockedFeatures.length > 0;

  React.useEffect(() => {
    // Show once, only after onboarding, and only for free-plan patients.
    // Wait a beat so feature locks have a chance to sync first.
    if (!shown && wizardDone) {
      const id = setTimeout(() => {
        if (useAppStore.getState().lockedFeatures.length > 0) setVisible(true);
        else mark(); // fully unlocked → skip the welcome for good
      }, 1500);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, wizardDone, isFreePlan]);

  const dismiss = () => {
    setVisible(false);
    mark();
  };

  const contactSupport = () => {
    const msg = encodeURIComponent(t('plan.waMessage'));
    Linking.openURL(`whatsapp://send?phone=${SUPPORT_WA}&text=${msg}`).catch(() =>
      Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${msg}`).catch(() => {})
    );
    dismiss();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={['#34d399', '#19C37D']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={{ fontSize: 34 }}>👋</Text>
          </LinearGradient>

          <Text style={styles.title}>{t('plan.welcomeTitle')}</Text>
          <Text style={styles.body}>{t('plan.welcomeBody')}</Text>

          <View style={styles.freeChip}>
            <Text style={styles.freeChipText}>⭐ {t('plan.freeBadge')}</Text>
          </View>

          <Pressable onPress={contactSupport} style={{ alignSelf: 'stretch' }}>
            <LinearGradient
              colors={['#25D366', '#1ebe5d']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cta}
            >
              <WhatsAppIcon />
              <Text style={styles.ctaText}>{t('plan.upgrade')}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable onPress={dismiss} style={styles.later}>
            <Text style={styles.laterText}>{t('plan.later')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 26,
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.24,
    shadowRadius: 40,
    elevation: 16,
  },
  hero: {
    width: 86,
    height: 86,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#19C37D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  title: {
    fontFamily: F800,
    fontSize: 21,
    color: '#101828',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  body: {
    fontFamily: F500,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#667085',
    textAlign: 'center',
    marginTop: 10,
  },
  freeChip: {
    backgroundColor: '#FFF6E0',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 15,
    marginTop: 16,
    marginBottom: 20,
  },
  freeChipText: { fontFamily: F700, fontSize: 12.5, color: '#B45309' },
  cta: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
  },
  ctaText: { fontFamily: F800, fontSize: 15.5, color: '#ffffff' },
  later: { paddingVertical: 14, marginTop: 4 },
  laterText: { fontFamily: F700, fontSize: 14, color: '#98a1af' },
});
