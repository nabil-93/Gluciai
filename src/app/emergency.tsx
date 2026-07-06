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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BevelCard, ChevronLeft } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

const TYPE_FR: Record<string, string> = {
  type1: 'Diabète de type 1',
  type2: 'Diabète de type 2',
  gestational: 'Diabète gestationnel',
  prediabetes: 'Prédiabète',
};
const TYPE_AR: Record<string, string> = {
  type1: 'السكري من النوع الأول',
  type2: 'السكري من النوع الثاني',
  gestational: 'سكري الحمل',
  prediabetes: 'مرحلة ما قبل السكري',
};

export default function EmergencyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, glucoseLogs, insulinLogs } = useAppStore();

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const lastInsulin = insulinLogs[0];

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const call = (num: string) => Linking.openURL(`tel:${num.replace(/\s/g, '')}`);

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
          <Text style={styles.headTitle}>Urgence</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Call buttons */}
        <View style={styles.callRow}>
          <Pressable style={styles.samuBtn} onPress={() => call('141')}>
            <Text style={styles.samuIcon}>🚑</Text>
            <Text style={styles.samuLabel}>SAMU</Text>
            <Text style={styles.samuNum}>141</Text>
          </Pressable>
          {profile?.emergency_contact_phone ? (
            <Pressable
              style={styles.contactBtn}
              onPress={() => call(profile.emergency_contact_phone!)}
            >
              <Text style={styles.samuIcon}>📞</Text>
              <Text style={styles.contactLabel} numberOfLines={1}>
                {profile.emergency_contact_name || 'Contact'}
              </Text>
              <Text style={styles.contactNum}>
                {profile.emergency_contact_phone}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.contactBtn, { opacity: 0.6 }]}>
              <Text style={styles.samuIcon}>📞</Text>
              <Text style={styles.contactLabel}>Aucun contact</Text>
              <Text style={styles.contactNum}>Ajoutez-le au profil</Text>
            </View>
          )}
        </View>

        {/* Hypo first aid */}
        <BevelCard style={styles.aidCard}>
          <Text style={styles.aidTitle}>🧃 En cas d'hypoglycémie</Text>
          {[
            'Donnez 15 g de sucre rapide (3 morceaux de sucre, ½ verre de jus).',
            'Attendez 15 minutes puis re-mesurez la glycémie.',
            'Si la personne est inconsciente : NE RIEN donner par la bouche, appelez le 141.',
            'Placez la personne en position latérale de sécurité.',
          ].map((s, i) => (
            <View key={i} style={styles.aidRow}>
              <Text style={styles.aidNum}>{i + 1}</Text>
              <Text style={styles.aidText}>{s}</Text>
            </View>
          ))}
        </BevelCard>

        {/* Medical ID card — FR */}
        <View style={styles.idCard}>
          <Text style={styles.idBadge}>CARTE MÉDICALE</Text>
          <Text style={styles.idTitle}>Je suis diabétique</Text>
          <Text style={styles.idType}>{TYPE_FR[dType]}</Text>
          {usesInsulin ? (
            <Text style={styles.idLine}>💉 Traitement : insuline</Text>
          ) : null}
          {lastGlucose ? (
            <Text style={styles.idLine}>
              🩸 Dernière glycémie : {lastGlucose.value} mg/dL (
              {new Date(lastGlucose.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </Text>
          ) : null}
          {lastInsulin ? (
            <Text style={styles.idLine}>
              💉 Dernière injection : {lastInsulin.dose} U (
              {new Date(lastInsulin.created_at).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}{' '}
              {new Date(lastInsulin.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              )
            </Text>
          ) : null}
          <Text style={styles.idHint}>
            En cas de malaise : donnez-moi du sucre si je suis conscient(e),
            sinon appelez le 141.
          </Text>
        </View>

        {/* Medical ID card — AR */}
        <View style={[styles.idCard, styles.idCardAr]}>
          <Text style={[styles.idBadge, styles.ar]}>بطاقة طبية</Text>
          <Text style={[styles.idTitle, styles.ar]}>أنا مصاب(ة) بالسكري</Text>
          <Text style={[styles.idType, styles.ar]}>{TYPE_AR[dType]}</Text>
          {usesInsulin ? (
            <Text style={[styles.idLine, styles.ar]}>💉 العلاج: الأنسولين</Text>
          ) : null}
          <Text style={[styles.idHint, styles.ar]}>
            في حالة إغماء أو تصرف غريب: أعطوني سكر إذا كنت واعياً، وإلا اتصلوا
            بالإسعاف 141.
          </Text>
        </View>

        {profile?.doctor_name ? (
          <BevelCard style={styles.doctorRow}>
            <Text style={{ fontSize: 20 }}>🩺</Text>
            <Text style={styles.doctorText}>
              Médecin traitant : {profile.doctor_name}
            </Text>
          </BevelCard>
        ) : null}
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
  idCardAr: { backgroundColor: '#233046' },
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
  ar: { textAlign: 'right', writingDirection: 'rtl' },

  doctorRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  doctorText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
