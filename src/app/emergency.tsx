import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BevelCard, ChevronLeft } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** Medical-emergency number per app language — the patient picked the
 *  language of the country they live in / call for help in:
 *  fr = SAMU France (15), ar = SAMU Maroc (141), de = Notruf (112),
 *  en = 112 (EU standard, redirected by mobiles in most countries).
 *  The label is what locals actually call the service. */
const EMERGENCY: Record<string, { num: string; label: string }> = {
  fr: { num: '15', label: 'SAMU' },
  ar: { num: '141', label: 'الإسعاف' },
  de: { num: '112', label: 'Notruf' },
  en: { num: '112', label: 'Emergency' },
};

export default function EmergencyScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, glucoseLogs, insulinLogs } = useAppStore();

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const lastInsulin = insulinLogs[0];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const call = (num: string) => Linking.openURL(`tel:${num.replace(/\s/g, '')}`);

  const lang = (i18n.language || 'en').split('-')[0];
  const sos = EMERGENCY[lang] ?? EMERGENCY.en;
  /** The medical ID card is read out loud to bystanders — Arabic script
   *  must flow right-to-left when the app language is Arabic. */
  const rtl = lang === 'ar';

  const openHomeMap = () => {
    if (!profile?.home_address) return;
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        profile.home_address
      )}`
    );
  };

  const dType = profile?.diabetes_type ?? 'type2';
  const usesInsulin = (profile?.insulin_types?.length ?? 0) > 0;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} color="#fff" />
          </Pressable>
          <Text style={styles.headTitle}>{t('emergencyPage.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Call buttons */}
        <View style={styles.callRow}>
          <Pressable style={styles.samuBtn} onPress={() => call(sos.num)}>
            <Text style={styles.samuIcon}>🚑</Text>
            <Text style={styles.samuLabel}>{sos.label}</Text>
            <Text style={styles.samuNum}>{sos.num}</Text>
          </Pressable>
          {profile?.emergency_contact_phone ? (
            <Pressable
              style={styles.contactBtn}
              onPress={() => call(profile.emergency_contact_phone!)}
            >
              <Text style={styles.samuIcon}>📞</Text>
              <Text style={styles.contactLabel} numberOfLines={1}>
                {profile.emergency_contact_name || t('emergencyPage.contact')}
              </Text>
              <Text style={styles.contactNum}>
                {profile.emergency_contact_phone}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.contactBtn, { opacity: 0.6 }]}
              onPress={() => router.push('/profile-edit?section=emergency' as any)}
            >
              <Text style={styles.samuIcon}>📞</Text>
              <Text style={styles.contactLabel}>{t('emergencyPage.noContact')}</Text>
              <Text style={styles.contactNum}>{t('emergencyPage.addToProfile')}</Text>
            </Pressable>
          )}
        </View>

        {/* Treating doctor — callable like the emergency contact. */}
        {profile?.doctor_phone ? (
          <Pressable
            style={styles.doctorBtn}
            onPress={() => call(profile.doctor_phone!)}
          >
            <Text style={{ fontSize: 26 }}>🩺</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.doctorLabel} numberOfLines={1}>
                {profile.doctor_name || t('emergencyPage.doctorTitle')}
              </Text>
              <Text style={styles.doctorSub}>{t('emergencyPage.doctorTitle')}</Text>
            </View>
            <Text style={styles.doctorNum}>{profile.doctor_phone}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.doctorBtn, { opacity: 0.6 }]}
            onPress={() => router.push('/profile-edit?section=doctor' as any)}
          >
            <Text style={{ fontSize: 26 }}>🩺</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.doctorLabel} numberOfLines={1}>
                {profile?.doctor_name || t('emergencyPage.noDoctor')}
              </Text>
              <Text style={styles.doctorSub}>
                {t('emergencyPage.addDoctorPhone')}
              </Text>
            </View>
            <Text style={styles.doctorNum}>›</Text>
          </Pressable>
        )}

        {/* Hypo first aid — standard "rule of 15" steps, translated per app
            language. TODO(medical-review): the ar/de/en translations of these
            4 steps must be double-checked by a clinician / native speaker
            before store release (see i18n emergencyPage.hypoStep1-4). */}
        <BevelCard style={styles.aidCard}>
          <Text style={styles.aidTitle}>{t('emergencyPage.hypoTitle')}</Text>
          {[
            t('emergencyPage.hypoStep1'),
            t('emergencyPage.hypoStep2'),
            t('emergencyPage.hypoStep3', { num: sos.num }),
            t('emergencyPage.hypoStep4'),
          ].map((s, i) => (
            <View key={i} style={styles.aidRow}>
              <Text style={styles.aidNum}>{i + 1}</Text>
              <Text style={styles.aidText}>{s}</Text>
            </View>
          ))}
        </BevelCard>

        {/* Medical ID card — in the PATIENT'S language (the language they
            chose is the one spoken around them), emergency number to match. */}
        <View style={styles.idCard}>
          <Text style={[styles.idBadge, rtl && styles.ar]}>
            {t('emergencyPage.idBadge')}
          </Text>
          <Text style={[styles.idTitle, rtl && styles.ar]}>
            {t('emergencyPage.idTitle')}
          </Text>
          <Text style={[styles.idType, rtl && styles.ar]}>
            {t(`emergencyPage.idType_${dType}`)}
          </Text>
          {usesInsulin ? (
            <Text style={[styles.idLine, rtl && styles.ar]}>
              💉 {t('emergencyPage.idTreatment')}
            </Text>
          ) : null}
          {lastGlucose ? (
            <Text style={[styles.idLine, rtl && styles.ar]}>
              🩸 {t('emergencyPage.idGlucose')} : {lastGlucose.value} mg/dL (
              {new Date(lastGlucose.created_at).toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </Text>
          ) : null}
          {lastInsulin ? (
            <Text style={[styles.idLine, rtl && styles.ar]}>
              💉 {t('emergencyPage.idInjection')} : {lastInsulin.dose} U (
              {new Date(lastInsulin.created_at).toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'short',
              })}{' '}
              {new Date(lastInsulin.created_at).toLocaleTimeString(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </Text>
          ) : null}
          <Text style={[styles.idHint, rtl && styles.ar]}>
            {t('emergencyPage.idHint', { num: sos.num })}
          </Text>
        </View>

        {/* Home card — a bystander taps it and Google Maps opens on the
            patient's home address, so they can bring them home safely. */}
        {profile?.home_address ? (
          <Pressable style={[styles.idCard, styles.homeCard]} onPress={openHomeMap}>
            <Text style={[styles.idBadge, rtl && styles.ar]}>
              {t('emergencyPage.homeBadge')}
            </Text>
            <Text style={[styles.idTitle, rtl && styles.ar]}>
              📍 {t('emergencyPage.homeTitle')}
            </Text>
            <Text style={[styles.idLine, rtl && styles.ar]}>
              {profile.home_address}
            </Text>
            <View style={styles.mapRow}>
              <Text style={styles.mapBtn}>🗺️ Google Maps ›</Text>
            </View>
            <Text style={[styles.idHint, rtl && styles.ar]}>
              {t('emergencyPage.homeHint')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.idCard, styles.homeCard, { opacity: 0.75 }]}
            onPress={() => router.push('/profile-edit?section=emergency' as any)}
          >
            <Text style={[styles.idBadge, rtl && styles.ar]}>
              {t('emergencyPage.homeBadge')}
            </Text>
            <Text style={[styles.idTitle, rtl && styles.ar]}>
              📍 {t('emergencyPage.homeMissing')}
            </Text>
            <Text style={[styles.idHint, rtl && styles.ar]}>
              {t('emergencyPage.homeAdd')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#B3261E' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontSize: 19, fontWeight: '800', color: '#fff' },

  callRow: { flexDirection: 'row', gap: 12 },
  samuBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    gap: 4,
    ...shadows.floating,
  },
  samuIcon: { fontSize: 30 },
  samuLabel: { fontSize: 14, fontWeight: '700', color: '#B3261E' },
  samuNum: { fontSize: 26, fontWeight: '800', color: colors.text },
  contactBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    gap: 4,
  },
  contactLabel: { fontSize: 14, fontWeight: '700', color: '#fff' },
  contactNum: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },

  doctorBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  doctorLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  doctorSub: { fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  doctorNum: { fontSize: 15, fontWeight: '700', color: '#fff' },

  aidCard: { marginTop: 16 },
  aidTitle: { fontSize: 17, fontWeight: '750' as any, color: colors.text, marginBottom: 10 },
  aidRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  aidNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
  },
  aidText: { flex: 1, fontSize: 14.5, lineHeight: 20, color: '#3E3E44' },

  idCard: {
    marginTop: 16,
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
    ...shadows.floating,
  },
  homeCard: { backgroundColor: '#233046' },
  idBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
  },
  idTitle: { marginTop: 8, fontSize: 26, fontWeight: '800', color: '#fff' },
  idType: { marginTop: 4, fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  idLine: { marginTop: 10, fontSize: 14.5, color: 'rgba(255,255,255,0.85)' },
  idHint: {
    marginTop: 12,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.6)',
  },
  mapRow: { marginTop: 14, flexDirection: 'row' },
  mapBtn: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    overflow: 'hidden',
  },
  ar: { textAlign: 'right', writingDirection: 'rtl' },
});
