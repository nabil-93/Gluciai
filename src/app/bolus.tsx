import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, BevelCard, ChevronLeft } from '@/components/ui';
import { computeBolus, saveInsulin } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function BolusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, glucoseLogs, meals } = useAppStore();

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const lastMeal = meals.find((m) => isToday(m.created_at));

  const [carbs, setCarbs] = useState(
    lastMeal ? String(Math.round(lastMeal.result.carbohydrates)) : ''
  );
  const [glucose, setGlucose] = useState(
    lastGlucose ? String(lastGlucose.value) : ''
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const result = useMemo(
    () =>
      computeBolus(
        Number(carbs) || 0,
        Number(glucose) > 0 ? Number(glucose) : null,
        profile
      ),
    [carbs, glucose, profile]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const record = async () => {
    if (result.total <= 0) return;
    setSaving(true);
    try {
      await saveInsulin(result.total, 'rapid', 'Bolus calculé');
      setSaved(true);
      setTimeout(close, 900);
    } finally {
      setSaving(false);
    }
  };

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
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>Calculateur de bolus</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Inputs */}
        <BevelCard style={styles.inputCard}>
          <Text style={styles.inputLabel}>Glucides du repas</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={carbs}
              onChangeText={setCarbs}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.bigInput}
            />
            <Text style={styles.unit}>g</Text>
          </View>
          {lastMeal ? (
            <Pressable
              onPress={() =>
                setCarbs(String(Math.round(lastMeal.result.carbohydrates)))
              }
            >
              <Text style={styles.prefillHint}>
                Dernier repas scanné : {lastMeal.result.food_name} (
                {Math.round(lastMeal.result.carbohydrates)} g)
              </Text>
            </Pressable>
          ) : null}
        </BevelCard>

        <BevelCard style={styles.inputCard}>
          <Text style={styles.inputLabel}>Glycémie actuelle</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={glucose}
              onChangeText={setGlucose}
              keyboardType="numeric"
              placeholder="—"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.bigInput}
            />
            <Text style={styles.unit}>mg/dL</Text>
          </View>
        </BevelCard>

        {/* Hypo warning */}
        {result.isLow ? (
          <View style={styles.hypo}>
            <Text style={styles.hypoTitle}>⚠️ Glycémie basse</Text>
            <Text style={styles.hypoBody}>
              Votre glycémie est sous {profile?.target_low ?? 70} mg/dL.
              Traitez l'hypoglycémie d'abord (15 g de sucre rapide), ne prenez
              pas de bolus de correction.
            </Text>
          </View>
        ) : null}

        {/* Result */}
        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>Dose estimée</Text>
          <View style={styles.resultRow}>
            <Text style={styles.resultValue}>
              {result.total.toLocaleString('fr-FR')}
            </Text>
            <Text style={styles.resultUnit}>U</Text>
          </View>
          <View style={styles.breakdown}>
            <View style={styles.breakRow}>
              <Text style={styles.breakLabel}>
                Repas — {carbs || 0} g ÷ ratio {result.ratio}
              </Text>
              <Text style={styles.breakValue}>{result.mealBolus} U</Text>
            </View>
            <View style={styles.breakRow}>
              <Text style={styles.breakLabel}>
                Correction — facteur {result.correctionFactor}, cible{' '}
                {result.targetMid}
              </Text>
              <Text style={styles.breakValue}>{result.correction} U</Text>
            </View>
          </View>
        </View>

        <AppButton
          label={saved ? '✓ Injection enregistrée' : "Enregistrer l'injection"}
          onPress={record}
          loading={saving}
          disabled={result.total <= 0 || saved}
        />

        <Text style={styles.disclaimer}>
          Estimation éducative IA uniquement — ceci n'est PAS un avis médical
          ni une prescription. Calcul basé sur votre profil (ratio glucides{' '}
          {result.ratio} g/U, facteur de correction {result.correctionFactor}{' '}
          mg/dL/U). Vérifiez toujours la dose avec votre médecin avant
          injection.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontSize: 19, fontWeight: '750' as any, color: colors.text },
  inputCard: { marginBottom: 12 },
  inputLabel: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  bigInput: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    minWidth: 90,
    padding: 0,
  },
  unit: { fontSize: 18, color: colors.textSecondary, fontWeight: '600' },
  prefillHint: { marginTop: 8, fontSize: 13.5, color: colors.ai },
  hypo: {
    backgroundColor: colors.dangerDim,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  hypoTitle: { fontSize: 16, fontWeight: '700', color: colors.danger },
  hypoBody: { marginTop: 6, fontSize: 14, lineHeight: 20, color: '#B3261E' },
  resultCard: {
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    ...shadows.floating,
  },
  resultLabel: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  resultRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  resultValue: { fontSize: 56, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  resultUnit: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  breakdown: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: 12,
    gap: 8,
  },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  breakLabel: { flex: 1, fontSize: 13.5, color: 'rgba(255,255,255,0.6)' },
  breakValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disclaimer: {
    marginTop: 16,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
