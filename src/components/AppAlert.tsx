import React, { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';

import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import {
  fetchPendingAlert,
  markAlertSeen,
  subscribeToAlerts,
  type AppAlertData,
} from '@/services/alerts';

// Same support line the free-plan welcome uses.
const SUPPORT_WA = '491637606478';

/**
 * Centered in-app alert. The admin/doctor sends a message from the dashboard
 * (app_alerts) and it appears here, over everything, with an optional contact
 * button: WhatsApp support, or a call to the patient's own doctor. Delivered
 * instantly via Realtime and also fetched on open for anything sent offline.
 */
export function AppAlert() {
  const { t } = useTranslation();
  const doctorPhone = useAppStore((s) => s.profile?.doctor_phone);
  const [alert, setAlert] = useState<AppAlertData | null>(null);

  useEffect(() => {
    if (isDemoMode || !supabase) return;
    let alive = true;
    let unsub = () => {};
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || !alive) return;
      const pending = await fetchPendingAlert();
      if (alive && pending) setAlert((cur) => cur ?? pending);
      unsub = subscribeToAlerts(uid, (a) => setAlert((cur) => cur ?? a));
    })();
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const close = async () => {
    const current = alert;
    setAlert(null);
    if (!current) return;
    await markAlertSeen(current.id);
    // If several alerts are queued, show the next one.
    const next = await fetchPendingAlert();
    if (next) setAlert(next);
  };

  // The doctor button is only useful when we actually know the doctor's number.
  const cta: AppAlertData['cta'] =
    alert?.cta === 'doctor' && !doctorPhone ? 'none' : alert?.cta ?? 'none';

  const onContact = () => {
    if (cta === 'support') {
      const msg = encodeURIComponent(t('appAlert.waMessage'));
      Linking.openURL(`whatsapp://send?phone=${SUPPORT_WA}&text=${msg}`).catch(() =>
        Linking.openURL(`https://wa.me/${SUPPORT_WA}?text=${msg}`).catch(() => {})
      );
    } else if (cta === 'doctor' && doctorPhone) {
      Linking.openURL(`tel:${doctorPhone.replace(/\s/g, '')}`).catch(() => {});
    }
    close();
  };

  if (!alert) return null;

  return (
    <Modal transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={['#60a5fa', '#4f46e5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={{ fontSize: 34 }}>📢</Text>
          </LinearGradient>

          <Text style={styles.title}>
            {alert.title || t('appAlert.defaultTitle')}
          </Text>
          <Text style={styles.body}>{alert.body}</Text>

          {cta !== 'none' ? (
            <Pressable onPress={onContact} style={styles.ctaWrap}>
              <LinearGradient
                colors={cta === 'support' ? ['#2ee59d', '#19C37D'] : ['#60a5fa', '#4f46e5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <Text style={{ fontSize: 15 }}>{cta === 'support' ? '💬' : '📞'}</Text>
                <Text style={styles.ctaText}>
                  {cta === 'support'
                    ? t('appAlert.contactSupport')
                    : t('appAlert.contactDoctor')}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : null}

          <Pressable onPress={close} style={styles.later}>
            <Text style={styles.laterText}>{t('appAlert.ok')}</Text>
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
    shadowColor: '#4f46e5',
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
    fontSize: 14,
    lineHeight: 21,
    color: '#475467',
    textAlign: 'center',
    marginTop: 10,
  },
  ctaWrap: { alignSelf: 'stretch', marginTop: 22 },
  cta: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#19C37D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  ctaText: { fontFamily: F800, fontSize: 15.5, color: '#ffffff' },
  later: { paddingVertical: 14, marginTop: 4 },
  laterText: { fontFamily: F700, fontSize: 14, color: '#98a1af' },
});
