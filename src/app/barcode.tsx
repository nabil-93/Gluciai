import React, { useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, BevelCard, HeroScreen, Spinner } from '@/components/ui';
import { permissionAction, requestOrOpenSettings } from '@/lib/permissions';
import {
  WebBarcodeScanner,
  webBarcodeSupported,
} from '@/components/WebBarcodeScanner';
import { saveMeal } from '@/services/data';
import { sourceLabel } from '@/services/nutrition/engine';
import { qualityClaimSupported, scoreMeal } from '@/services/nutrition/interpret';
import { sanitizePer100g } from '@/services/nutrition/plausibility';
import {
  lookupBarcodeMulti,
  saveToCatalog,
  type BarcodeResult,
} from '@/services/nutrition/providers/barcodeLookup';
import { colors, shadows } from '@/theme';
import type { NutritionResult, ProductProvenance } from '@/types';

const PORTIONS = [30, 50, 100, 150, 250];

/** The numeric per-100 g fields the patient can type in from the packaging
 *  (excludes the provenance flag, which is set by the act of typing). */
type Per100gField = 'calories' | 'carbs' | 'sugar' | 'protein' | 'fat' | 'fiber' | 'sodium';

export default function BarcodeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [product, setProduct] = useState<BarcodeResult | null>(null);
  const [grams, setGrams] = useState(100);
  const [saved, setSaved] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // When a barcode is found but has NO nutrition anywhere, we still show the
  // product name and let the patient type the values from the label.
  const [nutritionKnown, setNutritionKnown] = useState(true);
  /** True once the patient has typed at least one value off the packaging.
   *  That act — not the database it replaces — is what makes the figures
   *  theirs, so the saved meal is filed under their own label reading. */
  const [labelConfirmed, setLabelConfirmed] = useState(false);
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
        setLabelConfirmed(false);
        // Round to match the chip that represents it, so the active portion
        // is always visibly selected rather than silently in effect.
        setGrams(p.servingGrams ? Math.round(p.servingGrams) : 100);
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
  /* An impossible typed figure (100 g of carbohydrate per 100 g IS pure sugar,
     so 500 is nothing) is NOT rejected at the keystroke: these fields are
     uncontrolled by design — `defaultValue`, so "1." can be typed — and
     swallowing the digits would leave them on screen while the app silently
     held a different number. It is taken in, and `safe` below applies the
     shared bounds once: an impossible carbohydrate becomes UNKNOWN (never a
     clamped 100), the saved meal carries `warn:implausible`, and no dose can be
     seeded from it. */
  const setPer100 = (key: Per100gField, text: string) => {
    const v = Math.max(0, parseFloat(text.replace(',', '.')) || 0);
    // Also the ONE way an unverified catalogue figure becomes dosable: the
    // patient checked it against the packaging in front of them.
    setLabelConfirmed(true);
    setProduct((prev) =>
      prev
        ? {
            ...prev,
            per100g: {
              ...prev.per100g,
              [key]: v,
              // A value read off the packaging is the most authoritative
              // source there is — better than any database. Typing it in is
              // exactly how an unknown carbohydrate becomes a known one.
              ...(key === 'carbs' ? { carbs_known: true } : {}),
            },
          }
        : prev
    );
  };

  /** What this product's numbers are worth, and where they came from. Until
   *  Step 12 the screen printed a fixed "Open Food Facts · USDA · UPC" line and
   *  the saved meal claimed `openfoodfacts` whatever the real origin was. */
  const provenance: ProductProvenance | null = product
    ? labelConfirmed
      ? { origin: 'user_label', trusted_for_dosing: true }
      : product.provenance
    : null;
  /** An unverified patient contribution: shown in full, but its carbohydrate is
   *  not dosable until the packaging is checked. */
  const needsLabelCheck = provenance !== null && !provenance.trusted_for_dosing;

  const portions = useMemo(() => {
    const serving = product?.servingGrams;
    const all = serving ? [...PORTIONS, Math.round(serving)] : PORTIONS;
    return [...new Set(all)].sort((a, b) => a - b);
  }, [product?.servingGrams]);

  /**
   * This screen builds its own result instead of going through `resolveFood`,
   * so the shared per-100 g bounds have to be applied here too — a catalogue
   * row or an Open Food Facts entry carrying an impossible carbohydrate would
   * otherwise reach the journal, and the bolus field, straight from a scan.
   * The typed fields cannot produce one (see `setPer100`); a remote source can.
   */
  const safe = useMemo(
    () => (product ? sanitizePer100g(product.per100g) : null),
    [product]
  );

  // Scaled values + diabetes verdict
  const scaled = useMemo(() => {
    if (!safe) return null;
    const p = safe.per100g;
    const f = grams / 100;
    const r = (v: number) => Math.round(v * f * 10) / 10;
    return {
      calories: Math.round(p.calories * f),
      carbs: r(p.carbs),
      sugar: r(p.sugar),
      protein: r(p.protein),
      fat: r(p.fat),
      fiber: r(p.fiber),
      sodium: Math.round(p.sodium * f),
    };
  }, [safe, grams]);

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

  /** Whether this product's numbers can carry a verdict at all (Step 22A) —
   *  the same rule the meal screen and the home card use. */
  const rated =
    scaled !== null &&
    qualityClaimSupported({
      calories: scaled.calories,
      carbs_known: safe ? safe.per100g.carbs_known !== false : undefined,
    });

  const save = async () => {
    if (!product || !scaled || !safe) return;
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
      // A product can be fully identified and still declare no carbohydrate,
      // so this is about the ONE number a dose is calculated from — not about
      // the entry as a whole. The flag alone answers it correctly in all three
      // cases: `false` while the manual fields are still empty, `true` the
      // moment the patient copies a figure off the packaging (the most
      // authoritative source there is, including a declared 0), and `false`
      // again if what they typed is physically impossible (`safe`).
      //
      // It used to be gated on `nutritionKnown` as well, which meant a value
      // read off the label could never become known: the patient typed 45 g and
      // the bolus screen still said "not confirmed".
      carbs_known: safe.per100g.carbs_known !== false,
      // The real origin, not a fixed label. This used to read `openfoodfacts`
      // for every barcode meal — including a row another patient typed into the
      // shared catalogue, and including the patient's own label reading — which
      // put a database's name on a number no database had ever seen. The doctor
      // PDF and the journal both print this.
      source: provenance?.origin ?? 'user_label',
      ...(provenance ? { product_provenance: provenance } : {}),
      warnings: [
        ...(scaled.sugar > 15
          ? [t('barcodePage.sugarWarning', { sugar: Math.round(scaled.sugar) })]
          : []),
        // Stored as a KEY so a persisted scan re-localizes (see
        // scan-result's localizeWarning).
        ...(safe.issues.length > 0
          ? [`warn:implausible|${product.name.trim() || product.barcode}`]
          : []),
      ],
    };
    // The patient read these off the packaging, which outranks every remote
    // database — contribute them so the next person to scan this barcode gets
    // the product straight away.
    if (!nutritionKnown && product.per100g.calories >= 0 && product.name.trim()) {
      saveToCatalog(product, 'user', true);
    }

    await saveMeal(result, product.imageUrl);
    setSaved(true);
    setTimeout(close, 800);
  };

  /** Unknown barcode → the patient becomes the source. Opens the same product
   *  card with empty fields, filed under the code that was just scanned. */
  const addUnknownProduct = (code: string) => {
    setProduct({
      barcode: code,
      name: '',
      per100g: {
        calories: 0,
        carbs: 0,
        sugar: 0,
        protein: 0,
        fat: 0,
        fiber: 0,
        sodium: 0,
        // Empty fields waiting for the patient to read the label — not a
        // product that contains no carbohydrate.
        carbs_known: false,
      },
      nutritionKnown: false,
      // Nothing has been read yet: the patient is the source, and nothing here
      // is dosable until they have typed the label in.
      provenance: { origin: 'user_label', trusted_for_dosing: false },
    });
    setNutritionKnown(false);
    setLabelConfirmed(false);
    setNotFound(null);
    setGrams(100);
  };

  return (
    <HeroScreen
      title={t('barcode.title')}
      glyph="barcode"
      tint="#F2A93B"
      onClose={close}
      height={190}
    >

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
              /* A permanently denied permission cannot be re-prompted — the
                 button routes to Settings instead of doing nothing.
                 See src/lib/permissions.ts. */
              <AppButton
                label={
                  permissionAction(permission) === 'settings'
                    ? t('scanner.openSettings')
                    : t('barcode.allowCamera')
                }
                onPress={() => requestOrOpenSettings(permission, requestPermission)}
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
                <>
                  <Text style={styles.notFound}>
                    {t('barcode.notFound', { code: notFound })}
                  </Text>
                  <Text style={styles.notFoundHelp}>
                    {t('barcode.addHelp')}
                  </Text>
                  <AppButton
                    label={t('barcode.addProduct')}
                    onPress={() => addUnknownProduct(notFound)}
                    style={{ marginTop: 10 }}
                  />
                </>
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
                {product.name ? (
                  <Text style={styles.productName}>{product.name}</Text>
                ) : (
                  <TextInput
                    defaultValue=""
                    onChangeText={(v) =>
                      setProduct((prev) => (prev ? { ...prev, name: v } : prev))
                    }
                    placeholder={t('barcode.namePlaceholder')}
                    placeholderTextColor={colors.textPlaceholder}
                    style={styles.nameInput}
                  />
                )}
                {product.brand ? (
                  <Text style={styles.productBrand}>{product.brand}</Text>
                ) : null}
                <Text style={styles.productSource}>
                  {originText(provenance, t)} · {product.barcode}
                </Text>
              </View>
            </BevelCard>

            {/* Nutrition unknown, OR present but not from anywhere
                authoritative → let the patient type it from the label */}
            {!nutritionKnown || needsLabelCheck ? (
              <View style={styles.editBanner}>
                {/* Three ways in here: a product a database knew by name but
                    not by numbers, one the patient is adding from scratch
                    because nothing had heard of the barcode, or one whose
                    figures come from another patient's contribution — visible,
                    editable, and not dosable until this patient checks them
                    against the packaging in their hand. */}
                <Text style={styles.editBannerTitle}>
                  ✏️{' '}
                  {nutritionKnown
                    ? t('barcode.checkLabelTitle')
                    : t(product.name ? 'barcode.noValuesTitle' : 'barcode.newProductTitle')}
                </Text>
                <Text style={styles.editBannerSub}>
                  {nutritionKnown
                    ? t('barcode.checkLabelSub')
                    : t(product.name ? 'barcode.noValuesSub' : 'barcode.newProductSub')}
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
                {/* The product's own serving size joins the presets, so the
                    active portion always has a chip to highlight — otherwise
                    a 33 g serving reads as if 100 g were selected. */}
                {portions.map((p) => (
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

            {/* Diabetes verdict — withheld when the product cannot support one
                (Step 22A): the score starts at 100 and subtracts, so a row with
                nothing filled in scored "100/100 · Excellent" off its own empty
                fields. Same evidence rule as the meal screen. */}
            {quality && !rated ? (
              <View style={[styles.verdict, { borderColor: '#D7DCE3' }]}>
                <Text style={styles.verdictScore}>— · {t('analysis.scoreUnavailable')}</Text>
                <Text style={styles.verdictReason}>
                  {t('analysis.scoreUnavailableNoData')}
                </Text>
              </View>
            ) : null}
            {quality && rated ? (
              <View
                style={[styles.verdict, { borderColor: quality.color }]}
              >
                {/* border keeps the bright graphic colour, the label uses the
                    readable twin (see MealScore.textColor) */}
                {/* Phase 2: the indicator is named here too, so the figure
                    below it is not read as a product rating. */}
                <Text style={styles.verdictTitle}>{t('analysis.scoreTitle')}</Text>
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
    </HeroScreen>
  );
}

/**
 * One line saying where these numbers actually came from.
 *
 * A catalogue row names the catalogue AND what fed it, because those are two
 * different claims: "our shared catalogue, from Open Food Facts" is a database
 * figure that arrived through us, while "our shared catalogue, another
 * patient's label" is one person's reading. The screen used to print a fixed
 * list of the three APIs regardless.
 */
function originText(
  provenance: ProductProvenance | null,
  t: (key: string) => string
): string {
  if (!provenance) return '';
  if (provenance.origin !== 'product_catalog') return sourceLabel(provenance.origin);
  const shared = t('sources.sharedCatalog');
  const from = provenance.catalog_source;
  if (from === 'openfoodfacts') return `${shared} · ${sourceLabel('openfoodfacts')}`;
  if (from === 'usda') return `${shared} · ${sourceLabel('usda')}`;
  if (from === 'upcitemdb') return `${shared} · UPCitemdb`;
  // 'user' | 'label-photo' | anything unrecognized: a patient contributed it.
  return `${shared} · ${t('sources.sharedCatalogPatient')}`;
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
        keyboardType="decimal-pad"
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
  notFoundHelp: {
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  productCard: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  productImg: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#fff' },
  productImgFallback: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: { fontSize: 16.5, fontWeight: '750' as any, color: colors.text },
  nameInput: {
    fontSize: 16.5,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingVertical: 2,
  },
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
  /** Whose indicator the figure below is (Phase 2 interim name). */
  verdictTitle: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, marginBottom: 2 },
  verdictQ: { marginTop: 8, fontSize: 16, fontWeight: '750' as any, color: colors.text },
  verdictA: { marginTop: 4, fontSize: 14.5, lineHeight: 20, color: '#3E3E44' },
  verdictReason: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
});
