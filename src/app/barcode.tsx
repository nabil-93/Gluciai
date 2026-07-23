import React, { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, BevelCard, ChevronLeft, Spinner } from '@/components/ui';
import {
  WebBarcodeScanner,
  webBarcodeSupported,
} from '@/components/WebBarcodeScanner';
import { saveMeal } from '@/services/data';
import { scoreMeal } from '@/services/nutrition/mealScore';
import { lookupBarcodeMulti } from '@/services/nutrition/providers/barcodeLookup';
import type { BarcodeProduct } from '@/services/nutrition/providers/openfoodfacts';
import { colors, shadows } from '@/theme';
import type { NutritionResult } from '@/types';

const PORTIONS = [30, 50, 100, 150, 250];

export default function BarcodeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [product, setProduct] = useState<BarcodeProduct | null>(null);
  const [grams, setGrams] = useState(100);
  const [saved, setSaved] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // When a barcode is found but has NO nutrition anywhere, we still show the
  // product name and let the patient type the values from the label.
  const [nutritionKnown, setNutritionKnown] = useState(true);
  const scannedRef = useRef(false);

  const isWeb = Platform.OS === 'web';

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const lookup = async (code: string) => {
    if (!code || loading) return;
    setLoading(true);
    setNotFound(null);
    try {
      const p = await lookupBarcodeMulti(code.trim());
      if (p) {
        setProduct(p);
        setNutritionKnown(p.nutritionKnown);
        setGrams(p.servingGrams ?? 100);
      } else {
        setNotFound(code.trim());
        scannedRef.current = false;
      }
    } finally {
      setLoading(false);
    }
  };

  const onBarcodeScanned = ({ data }: { data: string }) => {
    if (scannedRef.current || product || loading) return;
    scannedRef.current = true;
    lookup(data);
  };

  // Edit one per-100g value when nutrition is unknown (patient reads the
  // label). Values stay per 100 g; the portion scaler does the rest.
  const setPer100 = (key: keyof BarcodeProduct['per100g'], text: string) => {
    const v = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
    setProduct((prev) =>
      prev ? { ...prev, per100g: { ...prev.per100g, [key]: v } } : prev
    );
  };

  // Scaled values + diabetes verdict
  const scaled = useMemo(() => {
    if (!product) return null;
    const f = grams / 100;
    const r = (v: number) => Math.round(v * f * 10) / 10;
    return {
      calories: Math.round(product.per100g.calories * f),
      carbs: r(product.per100g.carbs),
      sugar: r(product.per100g.sugar),
      protein: r(product.per100g.protein),
      fat: r(product.per100g.fat),
      fiber: r(product.per100g.fiber),
      sodium: Math.round(product.per100g.sodium * f),
    };
  }, [product, grams]);

  const quality = useMemo(
    () =>
      scaled
        ? scoreMeal({
            calories: scaled.calories,
            carbs: scaled.carbs,
            sugar: scaled.sugar,
            protein: scaled.protein,
            fat: scaled.fat,
            fiber: scaled.fiber,
            sodium: scaled.sodium,
          })
        : null,
    [scaled]
  );

  const save = async () => {
    if (!product || !scaled) return;
    const result: NutritionResult = {
      food_name: product.brand
        ? `${product.name} (${product.brand})`
        : product.name,
      estimated_portion: `${grams} g`,
      calories: scaled.calories,
      carbohydrates: scaled.carbs,
      sugar: scaled.sugar,
      protein: scaled.protein,
      fat: scaled.fat,
      fiber: scaled.fiber,
      sodium: scaled.sodium,
      glycemic_index: 0,
      confidence: 1,
      nutrition_confidence: 0.85,
      source: 'openfoodfacts',
      warnings:
        scaled.sugar > 15
          ? [t('barcodePage.sugarWarning', { sugar: Math.round(scaled.sugar) })]
          : [],
    };
    await saveMeal(result, product.imageUrl);
    setSaved(true);
    setTimeout(close, 800);
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('barcode.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {!product ? (
          <>
            {/* Native camera scanner (iOS/Android app) */}
            {!isWeb && permission?.granted ? (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  barcodeScannerSettings={{
                    barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
                  }}
                  onBarcodeScanned={onBarcodeScanned}
                />
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>{t('barcode.aim')}</Text>
              </View>
            ) : null}
            {!isWeb && permission && !permission.granted ? (
              <AppButton
                label={t('barcode.allowCamera')}
                onPress={requestPermission}
                style={{ marginBottom: 14 }}
              />
            ) : null}

            {/* Web camera scanner — starts on a tap (required by iOS Safari).
                Camera AND manual entry are both always offered. */}
            {isWeb && webBarcodeSupported ? (
              scanning ? (
                <WebBarcodeScanner
                  onDetected={(code) => {
                    if (scannedRef.current || product || loading) return;
                    scannedRef.current = true;
                    setScanning(false);
                    lookup(code);
                  }}
                  onError={(m) => {
                    setCamError(m);
                    setScanning(false);
                  }}
                />
              ) : (
                <AppButton
                  label={`📷 ${t('barcode.scanWithCamera')}`}
                  onPress={() => {
                    setCamError(null);
                    scannedRef.current = false;
                    setScanning(true);
                  }}
                  style={{ marginBottom: 14 }}
                />
              )
            ) : null}

            {/* Manual input — always available as a fallback */}
            <BevelCard>
              <Text style={styles.manualLabel}>
                {isWeb && webBarcodeSupported
                  ? t('barcode.orType')
                  : t('barcode.type')}
              </Text>
              <View style={styles.manualRow}>
                <TextInput
                  value={manualCode}
                  onChangeText={setManualCode}
                  keyboardType="numeric"
                  placeholder={t('barcode.example')}
                  placeholderTextColor={colors.textPlaceholder}
                  style={styles.manualInput}
                />
                <Pressable
                  onPress={() => lookup(manualCode)}
                  disabled={loading || manualCode.trim().length < 6}
                  style={[
                    styles.manualBtn,
                    (loading || manualCode.trim().length < 6) && {
                      opacity: 0.4,
                    },
                  ]}
                >
                  {loading ? (
                    <Spinner size={20} color="#fff" />
                  ) : (
                    <Text style={styles.manualBtnText}>OK</Text>
                  )}
                </Pressable>
              </View>
              {loading ? (
                <Text style={styles.searching}>{t('barcode.searching')}</Text>
              ) : null}
              {camError ? (
                <Text style={styles.searching}>{camError}</Text>
              ) : null}
              {notFound ? (
                <Text style={styles.notFound}>
                  {t('barcode.notFound', { code: notFound })}
                </Text>
              ) : null}
            </BevelCard>
          </>
        ) : (
          <>
            {/* Product card */}
            <BevelCard style={styles.productCard}>
              {product.imageUrl ? (
                <Image
                  source={{ uri: product.imageUrl }}
                  style={styles.productImg}
                  contentFit="contain"
                />
              ) : (
                <View style={[styles.productImg, styles.productImgFallback]}>
                  <Text style={{ fontSize: 34 }}>📦</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.productName}>{product.name}</Text>
                {product.brand ? (
                  <Text style={styles.productBrand}>{product.brand}</Text>
                ) : null}
                <Text style={styles.productSource}>
                  {t('barcode.source')} · {product.barcode}
                </Text>
              </View>
            </BevelCard>

            {/* Nutrition unknown → let the patient type it from the label */}
            {!nutritionKnown ? (
              <View style={styles.editBanner}>
                <Text style={styles.editBannerTitle}>
                  ✏️ {t('barcode.noValuesTitle')}
                </Text>
                <Text style={styles.editBannerSub}>
                  {t('barcode.noValuesSub')}
                </Text>
                <View style={styles.editRow}>
                  <EditField
                    label={t('barcode.kcal100')}
                    value={product.per100g.calories}
                    onChange={(v) => setPer100('calories', v)}
                  />
                  <EditField
                    label={t('barcode.carbs100')}
                    value={product.per100g.carbs}
                    onChange={(v) => setPer100('carbs', v)}
                  />
                  <EditField
                    label={t('barcode.sugar100')}
                    value={product.per100g.sugar}
                    onChange={(v) => setPer100('sugar', v)}
                  />
                </View>
              </View>
            ) : null}

            {/* Portion selector */}
            <BevelCard style={{ marginTop: 12 }}>
              <Text style={styles.portionTitle}>{t('barcodePage.portionTitle')}</Text>
              <View style={styles.portionRow}>
                {PORTIONS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setGrams(p)}
                    style={[styles.pChip, grams === p && styles.pChipOn]}
                  >
                    <Text
                      style={[styles.pChipText, grams === p && { color: '#fff' }]}
                    >
                      {p} g
                    </Text>
                  </Pressable>
                ))}
              </View>
            </BevelCard>

            {/* Values */}
            {scaled ? (
              <BevelCard style={{ marginTop: 12 }}>
                <View style={styles.valuesGrid}>
                  <Value label={t('nutritionPage.calories')} value={`${scaled.calories}`} unit="kcal" color={colors.warning} />
                  <Value label={t('nutritionPage.carbs')} value={`${scaled.carbs}`} unit="g" color={colors.carbs} />
                  <Value label={t('nutritionPage.sugar')} value={`${scaled.sugar}`} unit="g" color={colors.protein} />
                  <Value label={t('nutritionPage.protein')} value={`${scaled.protein}`} unit="g" color={colors.ai} />
                  <Value label={t('nutritionPage.fat')} value={`${scaled.fat}`} unit="g" color={colors.lipids} />
                  <Value label={t('barcodePage.fiber')} value={`${scaled.fiber}`} unit="g" color={colors.primary} />
                </View>
              </BevelCard>
            ) : null}

            {/* Diabetes verdict */}
            {quality ? (
              <View
                style={[styles.verdict, { borderColor: quality.color }]}
              >
                {/* border keeps the bright graphic colour, the label uses the
                    readable twin (see MealScore.textColor) */}
                <Text style={[styles.verdictScore, { color: quality.textColor }]}>
                  {quality.score}/100 · {quality.label}
                </Text>
                <Text style={styles.verdictQ}>{t('barcodePage.verdictQ')}</Text>
                <Text style={styles.verdictA}>
                  {quality.score >= 70
                    ? t('barcodePage.verdictGood')
                    : quality.score >= 50
                      ? t('barcodePage.verdictOkay')
                      : t('barcodePage.verdictAvoid')}
                </Text>
                {quality.reasons.slice(0, 2).map((r, i) => (
                  <Text key={i} style={styles.verdictReason}>
                    • {r}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ gap: 10, marginTop: 14 }}>
              <AppButton
                label={saved ? t('barcodePage.saved') : t('barcodePage.save')}
                onPress={save}
                disabled={saved}
              />
              <AppButton
                label={t('barcodePage.scanAnother')}
                variant="secondary"
                onPress={() => {
                  setProduct(null);
                  setManualCode('');
                  setSaved(false);
                  scannedRef.current = false;
                }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Value({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.value}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={[styles.valueNum, { color }]}>
        {value} <Text style={styles.valueUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

/** Editable per-100g number field used when nutrition is unknown. */
function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (text: string) => void;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      <TextInput
        defaultValue={value ? String(value) : ''}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textPlaceholder}
        style={styles.editFieldInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  cameraWrap: {
    height: 260,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#101014',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 220,
    height: 120,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  scanHint: {
    position: 'absolute',
    bottom: 14,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13.5,
    fontWeight: '600',
  },
  manualLabel: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  manualRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  manualInput: {
    flex: 1,
    fontSize: 17,
    backgroundColor: colors.surface2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  manualBtn: {
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searching: { marginTop: 10, fontSize: 13.5, color: colors.ai },
  notFound: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.danger },
  productCard: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  productImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#fff' },
  productImgFallback: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: { fontSize: 16.5, fontWeight: '750' as any, color: colors.text },
  productBrand: { marginTop: 2, fontSize: 13.5, color: colors.textSecondary },
  productSource: { marginTop: 4, fontSize: 12, color: colors.carbs, fontWeight: '600' },
  editBanner: {
    marginTop: 12,
    backgroundColor: '#fff7e6',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#f5c86a',
    padding: 14,
  },
  editBannerTitle: { fontSize: 14.5, fontWeight: '800' as any, color: '#8a5a00' },
  editBannerSub: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#8a6a2a',
  },
  editRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  editField: { flex: 1 },
  editFieldLabel: { fontSize: 11.5, fontWeight: '600', color: '#8a6a2a', marginBottom: 5 },
  editFieldInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eddca8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  portionTitle: { fontSize: 15, fontWeight: '650' as any, color: colors.text },
  portionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface2,
  },
  pChipOn: { backgroundColor: colors.ink },
  pChipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  value: { width: '33.33%' },
  valueLabel: { fontSize: 12, color: colors.textSecondary },
  valueNum: { marginTop: 2, fontSize: 18, fontWeight: '800' },
  valueUnit: { fontSize: 12, fontWeight: '600', color: colors.textTertiary },
  verdict: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 2,
    padding: 18,
    ...shadows.card,
  },
  verdictScore: { fontSize: 15, fontWeight: '800' },
  verdictQ: { marginTop: 8, fontSize: 16, fontWeight: '750' as any, color: colors.text },
  verdictA: { marginTop: 4, fontSize: 14.5, lineHeight: 20, color: '#3E3E44' },
  verdictReason: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
