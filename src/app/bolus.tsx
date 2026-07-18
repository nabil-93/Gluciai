import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import {
  checkModifiedDoseAI,
  requestBolusReport,
  type BolusAIReport,
} from '@/services/ai';
import {
  computeSmartBolus,
  localDoseCheck,
  type BolusResult,
  type DoseRisk,
} from '@/services/bolusEngine';
import { saveInsulin } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

type Phase = 'input' | 'loading' | 'report';

export default function BolusScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, glucoseLogs, insulinLogs, activityLogs, meals } = useAppStore();

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const lastMeal = meals.find((m) => isToday(m.created_at));

  const [carbs, setCarbs] = useState(
    lastMeal ? String(Math.round(lastMeal.result.carbohydrates)) : ''
  );
  const [glucose, setGlucose] = useState(lastGlucose ? String(lastGlucose.value) : '');
  const [phase, setPhase] = useState<Phase>('input');
  const [engine, setEngine] = useState<BolusResult | null>(null);
  const [report, setReport] = useState<BolusAIReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDose, setEditDose] = useState(0);
  const [checking, setChecking] = useState(false);
  const [alert, setAlert] = useState<{ risk: DoseRisk; message: string; dose: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* Context the engine will use — shown as chips before calculating */
  const preview = useMemo(
    () =>
      computeSmartBolus({
        carbs: Number(carbs) || 0,
        glucose: Number(glucose) > 0 ? Number(glucose) : null,
        profile,
        insulinLogs,
        activityLogs,
        glucoseLogs,
        lastMeal,
      }),
    [carbs, glucose, profile, insulinLogs, activityLogs, glucoseLogs, lastMeal]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const calculate = async () => {
    const result = computeSmartBolus({
      carbs: Number(carbs) || 0,
      glucose: Number(glucose) > 0 ? Number(glucose) : null,
      profile,
      insulinLogs,
      activityLogs,
      glucoseLogs,
      lastMeal,
    });
    setEngine(result);
    setEditDose(result.total);
    setPhase('loading');
    // The AI writes the detailed report; if unreachable we still show the
    // engine result with the local explanations.
    const ai = await requestBolusReport(result, i18n.language);
    setReport(ai);
    setPhase('report');
  };

  const doSave = async (dose: number, modified: boolean) => {
    if (!engine) return;
    setSaving(true);
    try {
      const note = modified
        ? t('bolus.noteModified', { rec: engine.total, dose })
        : t('bolus.noteAccepted', { carbs: engine.carbs, glucose: engine.glucose ?? '—' });
      await saveInsulin(dose, 'rapid', note);
      setSaved(true);
      setAlert(null);
      setTimeout(close, 1100);
    } finally {
      setSaving(false);
    }
  };

  /** Verify a patient-modified dose: local rules + AI, worse risk wins. */
  const verifyAndSave = async () => {
    if (!engine) return;
    const dose = editDose;
    if (dose === engine.total) {
      await doSave(dose, false);
      return;
    }
    setChecking(true);
    const local = localDoseCheck(dose, engine);
    const ai = await checkModifiedDoseAI(engine, dose, i18n.language);
    setChecking(false);

    const order: DoseRisk[] = ['ok', 'caution', 'danger'];
    const worst: DoseRisk =
      order[Math.max(order.indexOf(local.risk), order.indexOf(ai?.risk ?? 'ok'))];

    if (worst === 'ok') {
      await doSave(dose, true);
      return;
    }
    const fallbackMsg =
      worst === 'danger' ? t('bolus.checkDangerFallback') : t('bolus.checkCautionFallback');
    setAlert({ risk: worst, message: ai?.message || fallbackMsg, dose });
  };

  const fmtU = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const isHypo = engine?.flags.includes('hypo');

  /* ───────────────────────── UI ───────────────────────── */
  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 60,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('bolus.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ════════ PHASE: INPUT ════════ */}
        {phase === 'input' ? (
          <FadeInView>
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>{t('bolus.carbsLabel')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#98a1af"
                  style={styles.bigInput}
                />
                <Text style={styles.unit}>g</Text>
              </View>
              {lastMeal ? (
                <Pressable
                  onPress={() => setCarbs(String(Math.round(lastMeal.result.carbohydrates)))}
                >
                  <Text style={styles.prefillHint}>
                    🍽️ {lastMeal.result.food_name} · {Math.round(lastMeal.result.carbohydrates)} g
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>{t('bolus.glucoseLabel')}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  value={glucose}
                  onChangeText={setGlucose}
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor="#98a1af"
                  style={styles.bigInput}
                />
                <Text style={styles.unit}>mg/dL</Text>
              </View>
            </View>

            {/* What the AI will take into account */}
            <View style={styles.ctxCard}>
              <Text style={styles.ctxTitle}>🤖 {t('bolus.ctxTitle')}</Text>
              <View style={styles.chipsWrap}>
                {lastMeal ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      🍽️ {Math.round(lastMeal.result.sugar ?? 0)}g {t('bolus.ctxSugar')} ·{' '}
                      {Math.round(lastMeal.result.calories ?? 0)} kcal
                    </Text>
                  </View>
                ) : null}
                {preview.iob > 0.1 ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      💉 {fmtU(preview.iob)} U {t('bolus.ctxIob')}
                    </Text>
                  </View>
                ) : null}
                {preview.recentActivity ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      🏃 {preview.recentActivity.kind} · {preview.recentActivity.minutes} min
                    </Text>
                  </View>
                ) : null}
                {preview.trendPerMin !== null ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      {preview.trendPerMin <= -1 ? '📉' : preview.trendPerMin >= 2 ? '📈' : '➡️'}{' '}
                      {t('bolus.ctxTrend')}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    ⚙️ 1U/{preview.ratio}g · ISF {preview.correctionFactor}
                  </Text>
                </View>
              </View>
            </View>

            <Pressable onPress={calculate} disabled={!carbs && !glucose}>
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.cta, !carbs && !glucose && { opacity: 0.5 }]}
              >
                <Text style={styles.ctaText}>🤖 {t('bolus.calculate')}</Text>
              </LinearGradient>
            </Pressable>
          </FadeInView>
        ) : null}

        {/* ════════ PHASE: LOADING ════════ */}
        {phase === 'loading' ? (
          <FadeInView style={styles.loadingBox}>
            <AnimatedRobot size={96} mood="happy" />
            <Text style={styles.loadingTitle}>{t('bolus.analyzing')}</Text>
            <Text style={styles.loadingSub}>{t('bolus.analyzingSub')}</Text>
            <View style={{ marginTop: 14 }}>
              <Spinner size={26} color={GREEN} />
            </View>
          </FadeInView>
        ) : null}

        {/* ════════ PHASE: REPORT ════════ */}
        {phase === 'report' && engine ? (
          <FadeInView>
            {/* Dose hero */}
            <View style={[styles.doseCard, isHypo && { backgroundColor: '#B3261E' }]}>
              <Text style={styles.doseLabel}>
                {isHypo ? t('bolus.hypoNoDose') : t('bolus.recommended')}
              </Text>
              <View style={styles.doseRow}>
                <Text style={styles.doseValue}>{fmtU(engine.total)}</Text>
                <Text style={styles.doseUnit}>U</Text>
              </View>
              <View style={styles.breakdown}>
                {engine.mealBolus > 0 ? (
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>
                      🍽️ {t('bolus.brMeal', { carbs: engine.carbs, ratio: engine.ratio })}
                    </Text>
                    <Text style={styles.breakValue}>+{fmtU(engine.mealBolus)} U</Text>
                  </View>
                ) : null}
                {engine.correction > 0 ? (
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>
                      🩸 {t('bolus.brCorrection', { glucose: engine.glucose, target: engine.targetMid })}
                    </Text>
                    <Text style={styles.breakValue}>+{fmtU(engine.correction)} U</Text>
                  </View>
                ) : null}
                {engine.iob > 0.1 ? (
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>💉 {t('bolus.brIob')}</Text>
                    <Text style={styles.breakValue}>−{fmtU(engine.iob)} U</Text>
                  </View>
                ) : null}
                {engine.activityFactor < 1 ? (
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>🏃 {t('bolus.brActivity')}</Text>
                    <Text style={styles.breakValue}>
                      −{Math.round((1 - engine.activityFactor) * 100)}%
                    </Text>
                  </View>
                ) : null}
                {engine.trendFactor !== 1 ? (
                  <View style={styles.breakRow}>
                    <Text style={styles.breakLabel}>
                      {engine.trendFactor < 1 ? '📉' : '📈'} {t('bolus.brTrend')}
                    </Text>
                    <Text style={styles.breakValue}>
                      {engine.trendFactor < 1 ? '−' : '+'}
                      {Math.round(Math.abs(1 - engine.trendFactor) * 100)}%
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Hypo instructions */}
            {isHypo ? (
              <View style={styles.hypoCard}>
                <Text style={styles.hypoTitle}>⚠️ {t('bolus.hypoTitle')}</Text>
                <Text style={styles.hypoBody}>{t('bolus.hypoBody', { low: engine.targetLow })}</Text>
              </View>
            ) : null}

            {/* AI warnings */}
            {report?.warnings?.length
              ? report.warnings.map((w, i) => (
                  <View key={i} style={styles.warnRow}>
                    <Text style={{ fontSize: 15 }}>⚠️</Text>
                    <Text style={styles.warnText}>{w}</Text>
                  </View>
                ))
              : null}

            {/* AI report sections */}
            {report?.sections?.length ? (
              <>
                <Text style={styles.sectionHead}>📋 {t('bolus.reportTitle')}</Text>
                {report.sections.map((s, i) => (
                  <View key={i} style={styles.reportCard}>
                    <View style={styles.reportHead}>
                      <Text style={{ fontSize: 17 }}>{s.icon}</Text>
                      <Text style={styles.reportTitle}>{s.title}</Text>
                    </View>
                    <Text style={styles.reportBody}>{s.body}</Text>
                  </View>
                ))}
                {report.conclusion ? (
                  <View style={[styles.reportCard, { backgroundColor: '#e9f6ef' }]}>
                    <Text style={[styles.reportBody, { color: '#14532d' }]}>
                      {report.conclusion}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.reportCard}>
                <Text style={styles.reportBody}>{t('bolus.aiUnavailable')}</Text>
              </View>
            )}

            {/* Fixed disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={{ fontSize: 15 }}>🛡️</Text>
              <Text style={styles.disclaimerText}>{t('bolus.disclaimer')}</Text>
            </View>

            {/* Actions */}
            {!editing ? (
              <>
                {!isHypo && engine.total > 0 ? (
                  <Pressable onPress={() => doSave(engine.total, false)} disabled={saving || saved}>
                    <LinearGradient
                      colors={['#2ec983', '#1fbc78']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.cta, (saving || saved) && { opacity: 0.6 }]}
                    >
                      {saving ? (
                        <Spinner size={22} color="#ffffff" />
                      ) : (
                        <Text style={styles.ctaText}>
                          {saved
                            ? `✓ ${t('bolus.savedOk')}`
                            : t('bolus.saveDose', { dose: fmtU(engine.total) })}
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                ) : null}
                {!isHypo ? (
                  <Pressable
                    onPress={() => {
                      setEditing(true);
                      setEditDose(engine.total);
                    }}
                    style={styles.ghostBtn}
                    disabled={saving || saved}
                  >
                    <Text style={styles.ghostBtnText}>✏️ {t('bolus.modify')}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{t('bolus.editTitle')}</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => setEditDose((d) => Math.max(0, Math.round((d - 0.5) * 2) / 2))}
                    style={styles.stepBtn}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <View style={{ alignItems: 'center', minWidth: 110 }}>
                    <Text style={styles.editValue}>{fmtU(editDose)}</Text>
                    <Text style={styles.editUnit}>U</Text>
                  </View>
                  <Pressable
                    onPress={() => setEditDose((d) => Math.round((d + 0.5) * 2) / 2)}
                    style={styles.stepBtn}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
                {editDose !== engine.total ? (
                  <Text style={styles.editDelta}>
                    {t('bolus.editDelta', { rec: fmtU(engine.total) })}
                  </Text>
                ) : null}
                <Pressable onPress={verifyAndSave} disabled={checking || saving}>
                  <LinearGradient
                    colors={['#2ec983', '#1fbc78']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.cta, { marginTop: 14 }, (checking || saving) && { opacity: 0.6 }]}
                  >
                    {saving ? (
                      <Spinner size={22} color="#ffffff" />
                    ) : checking ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Spinner size={18} color="#ffffff" />
                        <Text style={styles.ctaText}>{t('bolus.checking')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.ctaText}>{t('bolus.verifySave')}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => setEditing(false)} style={{ marginTop: 10 }}>
                  <Text style={[styles.ghostBtnText, { textAlign: 'center' }]}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
              </View>
            )}

            {saved ? <Text style={styles.savedNote}>✓ {t('bolus.savedNote')}</Text> : null}
          </FadeInView>
        ) : null}
      </ScrollView>

      {/* ════════ RISK ALERT MODAL ════════ */}
      <Modal visible={!!alert} transparent animationType="fade" onRequestClose={() => setAlert(null)}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View
              style={[
                styles.alertHalo,
                { backgroundColor: alert?.risk === 'danger' ? '#fdecec' : '#fdf0d8' },
              ]}
            >
              <Text style={{ fontSize: 30 }}>{alert?.risk === 'danger' ? '🚨' : '⚠️'}</Text>
            </View>
            <Text style={styles.alertTitle}>
              {alert?.risk === 'danger' ? t('bolus.alertDangerTitle') : t('bolus.alertCautionTitle')}
            </Text>
            <Text style={styles.alertMsg}>{alert?.message}</Text>
            <View style={styles.alertDoctorBox}>
              <Text style={styles.alertDoctorText}>👨‍⚕️ {t('bolus.alertDoctor')}</Text>
            </View>
            <Pressable onPress={() => setAlert(null)} style={{ alignSelf: 'stretch' }}>
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>{t('bolus.alertCancel')}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => alert && doSave(alert.dose, true)}
              style={{ marginTop: 12 }}
              disabled={saving}
            >
              <Text style={styles.alertForce}>{t('bolus.alertForce')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
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
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 18, color: INK },

  /* Inputs */
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  inputLabel: { fontFamily: F600, fontSize: 13.5, color: '#667085' },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  bigInput: { fontFamily: F800, fontSize: 38, color: INK, minWidth: 90, padding: 0 },
  unit: { fontFamily: F600, fontSize: 16, color: '#98A2B3' },
  prefillHint: { marginTop: 8, fontFamily: F600, fontSize: 12.5, color: GREEN },

  ctxCard: {
    backgroundColor: '#f3f0ff',
    borderRadius: 18,
    padding: 15,
    marginBottom: 16,
  },
  ctxTitle: { fontFamily: F700, fontSize: 13.5, color: '#4c3fa8' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  chip: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipText: { fontFamily: F600, fontSize: 11.5, color: '#3d3564' },

  cta: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: { fontFamily: F700, fontSize: 15, color: '#ffffff' },

  /* Loading */
  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingTitle: { fontFamily: F800, fontSize: 17, color: INK, marginTop: 18 },
  loadingSub: {
    fontFamily: F500,
    fontSize: 12.5,
    color: '#667085',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },

  /* Dose hero */
  doseCard: {
    backgroundColor: INK,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    ...shadows.floating,
  },
  doseLabel: { fontFamily: F600, fontSize: 13.5, color: 'rgba(255,255,255,0.65)' },
  doseRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  doseValue: { fontFamily: F800, fontSize: 54, color: '#fff', letterSpacing: -1 },
  doseUnit: { fontFamily: F700, fontSize: 22, color: 'rgba(255,255,255,0.7)' },
  breakdown: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
    paddingTop: 10,
    gap: 7,
  },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  breakLabel: { flex: 1, fontFamily: F500, fontSize: 12.5, color: 'rgba(255,255,255,0.65)' },
  breakValue: { fontFamily: F700, fontSize: 13, color: '#fff' },

  hypoCard: { backgroundColor: '#fdecec', borderRadius: 18, padding: 16, marginBottom: 12 },
  hypoTitle: { fontFamily: F700, fontSize: 15, color: '#B3261E' },
  hypoBody: { marginTop: 5, fontFamily: F500, fontSize: 13, lineHeight: 19, color: '#8a2822' },

  warnRow: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#fdf0d8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, fontFamily: F600, fontSize: 12.5, lineHeight: 18, color: '#8a5a10' },

  sectionHead: { fontFamily: F800, fontSize: 15.5, color: INK, marginTop: 8, marginBottom: 10 },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    ...shadows.card,
  },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reportTitle: { flex: 1, fontFamily: F700, fontSize: 13.5, color: INK },
  reportBody: { fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#41505f' },

  disclaimerBox: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1, fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },

  ghostBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  ghostBtnText: { fontFamily: F700, fontSize: 13.5, color: '#41505f' },

  /* Edit */
  editCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    ...shadows.card,
  },
  editTitle: { fontFamily: F700, fontSize: 14.5, color: INK, textAlign: 'center' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 14,
  },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: F800, fontSize: 22, color: INK },
  editValue: { fontFamily: F800, fontSize: 40, color: INK, letterSpacing: -1 },
  editUnit: { fontFamily: F600, fontSize: 14, color: '#98A2B3' },
  editDelta: {
    fontFamily: F600,
    fontSize: 12,
    color: '#b45309',
    textAlign: 'center',
    marginTop: 8,
  },
  savedNote: {
    fontFamily: F700,
    fontSize: 13.5,
    color: GREEN,
    textAlign: 'center',
    marginTop: 14,
  },

  /* Alert modal */
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  alertBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  alertHalo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  alertTitle: { fontFamily: F800, fontSize: 17, color: INK, textAlign: 'center' },
  alertMsg: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: '#41505f',
    textAlign: 'center',
    marginTop: 8,
  },
  alertDoctorBox: {
    backgroundColor: '#fdf0d8',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  alertDoctorText: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#8a5a10',
    textAlign: 'center',
    lineHeight: 18,
  },
  alertForce: { fontFamily: F600, fontSize: 12.5, color: '#B3261E', textAlign: 'center' },
});
