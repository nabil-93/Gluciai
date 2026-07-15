import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Polygon, Text as SvgText } from 'react-native-svg';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import {
  AnimatedCounter,
  AnimatedRobot,
  ChevronLeft,
  FadeInView,
} from '@/components/ui';
import { isRTL } from '@/i18n';
import { confirmAsync } from '@/lib/confirm';
import { deleteLabReport, saveLabReport, updateLabReport } from '@/services/data';
import {
  LabSpeaker,
  explainLabValue,
  extractLabReport,
  generateLabReportText,
  generateLabVoiceScript,
  type LabExtraction,
} from '@/services/labs';
import { useAppStore } from '@/store/useAppStore';
import type { LabReport, LabValue, LabValueStatus } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* Status palette — same colors as the Cabinet system. */
const STATUS: Record<
  LabValueStatus,
  { color: string; bg: string; border: string; text: string }
> = {
  ok: { color: '#10b981', bg: '#e9fbf2', border: '#b8ecd4', text: '#0f7a45' },
  warn: { color: '#f59e0b', bg: '#fdf4e3', border: '#f4dfb4', text: '#a16207' },
  danger: { color: '#ef4444', bg: '#fdeaea', border: '#f6c4c4', text: '#b91c1c' },
};

/* ── Small markdown-lite renderer (the report uses **bold** + dashes) ── */
function MdText({ text }: { text: string }) {
  return (
    <View style={{ gap: 5 }}>
      {text.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 4 }} />;
        const parts = trimmed
          .split(/(\*\*[^*]+\*\*)/g)
          .filter(Boolean)
          .map((p, j) =>
            p.startsWith('**') && p.endsWith('**') ? (
              <Text key={j} style={{ fontFamily: F700, color: '#111827' }}>
                {p.slice(2, -2)}
              </Text>
            ) : (
              p
            )
          );
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
        const isTitle = /^\*\*[^*]+\*\*:?$/.test(trimmed);
        return (
          <Text
            key={i}
            style={[
              styles.mdLine,
              isBullet && styles.mdBullet,
              isTitle && styles.mdTitle,
            ]}
          >
            {isBullet ? '•  ' : ''}
            {isBullet ? parts.map((p) => (typeof p === 'string' ? p.replace(/^[-•]\s+/, '') : p)) : parts}
          </Text>
        );
      })}
    </View>
  );
}

/* ── Value card (grid, colored by status, tap → AI detail) ── */
function ValueCard({ v, onPress }: { v: LabValue; onPress: () => void }) {
  const s = STATUS[v.status];
  const num = parseFloat(v.value);
  const hasRange = v.refMin !== null && v.refMax !== null && !isNaN(num);
  const pct = hasRange
    ? Math.min(100, Math.max(0, ((num - (v.refMin as number)) / (((v.refMax as number) - (v.refMin as number)) || 1)) * 100))
    : null;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.valueCard, { backgroundColor: s.bg, borderColor: s.border }]}
    >
      <View style={styles.valueCardHead}>
        <Text style={styles.valueLabel} numberOfLines={2}>
          {v.label}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: s.color }]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={[styles.valueNum, { color: s.text }]}>{v.value}</Text>
        <Text style={styles.valueUnit}>{v.unit}</Text>
      </View>
      {pct !== null ? (
        <>
          <View style={styles.rangeTrack}>
            <View
              style={[styles.rangeFill, { width: `${pct}%`, backgroundColor: s.color }]}
            />
          </View>
          <Text style={styles.rangeRef}>
            {v.refMin} – {v.refMax} {v.unit}
          </Text>
        </>
      ) : null}
    </Pressable>
  );
}

/* ── Donut: ok / warn / danger distribution + global score.
 * The ring spins/fades in and the score COUNTS UP in the middle. ── */
function DonutChart({ values, score }: { values: LabValue[]; score: number }) {
  const ok = values.filter((v) => v.status === 'ok').length;
  const warn = values.filter((v) => v.status === 'warn').length;
  const danger = values.filter((v) => v.status === 'danger').length;
  const total = Math.max(1, values.length);
  const R = 52;
  const C = 2 * Math.PI * R;
  const seg = (n: number) => (n / total) * C;

  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(spin, {
      toValue: 1,
      speed: 4,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Segments drawn as stroked circles with dash offsets (gapless ring).
  let offset = C * 0.25; // start at 12 o'clock
  const rings = (
    [
      { n: ok, color: STATUS.ok.color },
      { n: warn, color: STATUS.warn.color },
      { n: danger, color: STATUS.danger.color },
    ] as const
  ).map((r, i) => {
    const el =
      r.n > 0 ? (
        <Circle
          key={i}
          cx={70}
          cy={70}
          r={R}
          stroke={r.color}
          strokeWidth={16}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={`${seg(r.n)} ${C - seg(r.n)}`}
          strokeDashoffset={offset}
        />
      ) : null;
    offset -= seg(r.n);
    return el;
  });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <View style={{ width: 140, height: 140 }}>
        <Animated.View
          style={{
            opacity: spin,
            transform: [
              {
                rotate: spin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-80deg', '0deg'],
                }),
              },
            ],
          }}
        >
          <Svg width={140} height={140}>
            <Circle cx={70} cy={70} r={R} stroke="#eef0f5" strokeWidth={16} fill="none" />
            {rings}
          </Svg>
        </Animated.View>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AnimatedCounter
              value={score}
              duration={1100}
              format={(n) => `${Math.round(n)}%`}
              style={{ fontFamily: F800, fontSize: 25, color: '#111827' }}
            />
            <Text style={{ fontFamily: F500, fontSize: 10, color: '#8b93a7' }}>
              score
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {(
          [
            ['labs.normal', ok, STATUS.ok.color],
            ['labs.watch', warn, STATUS.warn.color],
            ['labs.critical', danger, STATUS.danger.color],
          ] as const
        ).map(([key, n, color], i) => (
          <FadeInView key={key} delay={200 + i * 120}>
            <LegendRow labelKey={key} n={n} color={color} />
          </FadeInView>
        ))}
      </View>
    </View>
  );
}

function LegendRow({ labelKey, n, color }: { labelKey: string; n: number; color: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{t(labelKey)}</Text>
      <Text style={[styles.legendCount, { color }]}>{n}</Text>
    </View>
  );
}

/* ── Positioning bars: where each value sits inside its range ── */
function PositionBars({ values }: { values: LabValue[] }) {
  const { t } = useTranslation();
  const withRange = values
    .filter((v) => v.refMin !== null && v.refMax !== null && !isNaN(parseFloat(v.value)))
    .slice(0, 12);
  if (!withRange.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {withRange.map((v, i) => {
        const num = parseFloat(v.value);
        const mid = ((v.refMin as number) + (v.refMax as number)) / 2;
        const half = ((v.refMax as number) - (v.refMin as number)) / 2 || 1;
        const pct = Math.min(100, Math.max(0, ((num - mid) / half) * 50 + 50));
        const s = STATUS[v.status];
        return (
          <View key={i}>
            <View style={styles.posHead}>
              <Text style={styles.posLabel} numberOfLines={1}>
                {v.label}
              </Text>
              <Text style={[styles.posValue, { color: s.text }]}>
                {v.value} {v.unit}
              </Text>
            </View>
            <View style={styles.posTrack}>
              {/* normal zone (20-80%) */}
              <View style={styles.posNormalZone} />
              <View style={styles.posCenterLine} />
              <View
                style={[
                  styles.posMarker,
                  { left: `${pct}%`, backgroundColor: s.color },
                ]}
              />
            </View>
          </View>
        );
      })}
      <Text style={styles.chartHint}>{t('labs.positioningDesc')}</Text>
    </View>
  );
}

/* ── Radar: % of normal values per category ── */
function RadarChart({ values }: { values: LabValue[] }) {
  const cats = Array.from(new Set(values.map((v) => v.category))).slice(0, 8);
  if (cats.length < 3) return null;
  const size = 300;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const R = 92;
  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / cats.length - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const ringPts = (frac: number) =>
    cats.map((_, i) => pt(i, R * frac).join(',')).join(' ');
  const scores = cats.map((cat) => {
    const cv = values.filter((v) => v.category === cat);
    return cv.filter((v) => v.status === 'ok').length / cv.length;
  });
  const dataPts = cats.map((_, i) => pt(i, R * Math.max(0.06, scores[i])).join(',')).join(' ');
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <Polygon
            key={f}
            points={ringPts(f)}
            stroke="#e6e9f0"
            strokeWidth={1}
            fill="none"
          />
        ))}
        {cats.map((_, i) => {
          const [x, y] = pt(i, R);
          return (
            <Path key={i} d={`M${cx} ${cy} L${x} ${y}`} stroke="#e6e9f0" strokeWidth={1} />
          );
        })}
        <Polygon
          points={dataPts}
          fill="rgba(109,94,249,0.18)"
          stroke="#6d5ef9"
          strokeWidth={2}
        />
        {cats.map((cat, i) => {
          const [x, y] = pt(i, R + 16);
          const short = cat.length > 13 ? cat.slice(0, 12) + '…' : cat;
          return (
            <SvgText
              key={i}
              x={x}
              y={y + 3}
              textAnchor="middle"
              fontSize={9.5}
              fill="#5b6472"
            >
              {short}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/* Animated speaking bars for the voice-doctor card. */
function SpeakingBars({ active }: { active: boolean }) {
  const vals = useRef(Array.from({ length: 5 }, () => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!active) {
      vals.forEach((v) => v.setValue(0.3));
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(v, {
            toValue: 1,
            duration: 240 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 240 + i * 30,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 22 }}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 3.5,
            height: 18,
            borderRadius: 2,
            backgroundColor: '#8a3ffc',
            transform: [{ scaleY: v }],
          }}
        />
      ))}
    </View>
  );
}

/* Gate: labs is a HIDDEN feature. Only accounts the admin explicitly
 * granted (feature_access labs allowed=true) can even see this screen —
 * everyone else is silently sent home, with no locked-screen teaser and
 * no hint that the feature exists. */
export default function LabsScreenGate() {
  const granted = useAppStore((s) => s.grantedFeatures.includes('labs'));
  if (!granted) return <Redirect href="/(tabs)" />;
  return <LabsScreen />;
}

type Phase = 'idle' | 'extracting' | 'reporting';
type VoiceState = 'idle' | 'preparing' | 'speaking';

function LabsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const reports = useAppStore((s) => s.labReports);

  const [selectedId, setSelectedId] = useState<string | null>(reports[0]?.id ?? null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<
    (LabExtraction & { thumb?: string }) | null
  >(null);
  const [wantGraphs, setWantGraphs] = useState(true);
  const [wantReport, setWantReport] = useState(true);
  const [valueModal, setValueModal] = useState<LabValue | null>(null);
  const [valueText, setValueText] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [voice, setVoice] = useState<VoiceState>('idle');

  const speakerRef = useRef<LabSpeaker | null>(null);
  if (!speakerRef.current) speakerRef.current = new LabSpeaker();

  const selected = reports.find((r) => r.id === selectedId) ?? reports[0] ?? null;

  // Keep selection valid when reports change (add/delete/hydrate).
  useEffect(() => {
    if (!selected && reports.length) setSelectedId(reports[0].id);
  }, [reports, selected]);

  // Stop the voice when leaving the screen or switching report.
  useEffect(() => {
    return () => speakerRef.current?.stop();
  }, []);
  useEffect(() => {
    speakerRef.current?.stop();
    setVoice('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /* ── Pick photo (camera or gallery) → resize → extract ── */
  const prepare = async (
    uri: string
  ): Promise<{ ai: string; thumb: string } | null> => {
    try {
      const big = ImageManipulator.manipulate(uri);
      big.resize({ width: 1400 });
      const bigRef = await big.renderAsync();
      const bigOut = await bigRef.saveAsync({
        base64: true,
        compress: 0.85,
        format: SaveFormat.JPEG,
      });
      const small = ImageManipulator.manipulate(uri);
      small.resize({ width: 700 });
      const smallRef = await small.renderAsync();
      const smallOut = await smallRef.saveAsync({
        base64: true,
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      if (!bigOut.base64) return null;
      return {
        ai: bigOut.base64,
        thumb: smallOut.base64 ? `data:image/jpeg;base64,${smallOut.base64}` : '',
      };
    } catch {
      return null;
    }
  };

  const analyzeUri = async (uri: string) => {
    setError(null);
    setPhase('extracting');
    try {
      const img = await prepare(uri);
      if (!img) throw new Error('image');
      const extraction = await extractLabReport(img.ai, i18n.language);
      if (!extraction.values.length) {
        setError(t('labs.nothingFound'));
        return;
      }
      setWantGraphs(true);
      setWantReport(true);
      setPending({ ...extraction, thumb: img.thumb });
    } catch {
      setError(t('labs.extractError'));
    } finally {
      setPhase('idle');
    }
  };

  const pickFrom = async (source: 'camera' | 'gallery') => {
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 1,
          });
    const asset = picked.assets?.[0];
    if (asset?.uri) await analyzeUri(asset.uri);
  };

  /* ── Confirm the "what to generate" choice ── */
  const confirmGenerate = async () => {
    if (!pending) return;
    const extraction = pending;
    setPending(null);
    const saved = await saveLabReport({
      lab_name: extraction.labName ?? undefined,
      report_date: extraction.reportDate ?? undefined,
      summary: extraction.summary || undefined,
      values: extraction.values,
      has_graphs: wantGraphs,
      image_thumb: extraction.thumb || undefined,
    });
    setSelectedId(saved.id);
    if (wantReport) {
      setPhase('reporting');
      try {
        const text = await generateLabReportText(saved, i18n.language);
        updateLabReport(saved.id, { medical_report: text });
      } catch {
        setError(t('labs.reportError'));
      } finally {
        setPhase('idle');
      }
    }
  };

  /* ── Voice doctor: play / stop ── */
  const toggleVoice = async () => {
    const speaker = speakerRef.current!;
    if (voice === 'speaking' || voice === 'preparing') {
      speaker.stop();
      setVoice('idle');
      return;
    }
    if (!selected) return;
    let script = selected.voice_script;
    if (!script) {
      setVoice('preparing');
      try {
        script = await generateLabVoiceScript(selected, i18n.language);
        updateLabReport(selected.id, { voice_script: script });
      } catch {
        setError(t('labs.voiceError'));
        setVoice('idle');
        return;
      }
    }
    speaker.onEnd = () => setVoice('idle');
    speaker.speak(script, i18n.language);
    setVoice('speaking');
  };

  /* ── Per-value AI explanation ── */
  const openValue = async (v: LabValue) => {
    setValueModal(v);
    setValueText(null);
    try {
      const text = await explainLabValue(v, i18n.language);
      setValueText(text);
    } catch {
      setValueText(t('labs.extractError'));
    }
  };

  /* ── Generate the full report later (if skipped at creation) ── */
  const generateReportNow = async () => {
    if (!selected) return;
    setPhase('reporting');
    try {
      const text = await generateLabReportText(selected, i18n.language);
      updateLabReport(selected.id, { medical_report: text });
    } catch {
      setError(t('labs.reportError'));
    } finally {
      setPhase('idle');
    }
  };

  const onDelete = async (report: LabReport) => {
    const ok = await confirmAsync({
      title: t('labs.deleteTitle'),
      message: t('labs.deleteBody'),
      confirmLabel: t('chat.delete'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (!ok) return;
    speakerRef.current?.stop();
    setVoice('idle');
    deleteLabReport(report.id);
    if (selectedId === report.id) setSelectedId(null);
  };

  /* ── Ask the AI about this analysis ── */
  const askByCall = () => {
    speakerRef.current?.stop();
    router.push({ pathname: '/ai-call', params: { from: 'lab' } });
  };
  const askByChat = () => {
    speakerRef.current?.stop();
    router.push({ pathname: '/ai-chat', params: { from: 'lab' } });
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  const counts = useMemo(() => {
    const vals = selected?.values ?? [];
    const ok = vals.filter((v) => v.status === 'ok').length;
    const warn = vals.filter((v) => v.status === 'warn').length;
    const danger = vals.filter((v) => v.status === 'danger').length;
    const score = vals.length ? Math.round((ok / vals.length) * 100) : 0;
    return { ok, warn, danger, score };
  }, [selected]);

  const categories = useMemo(
    () => Array.from(new Set((selected?.values ?? []).map((v) => v.category))),
    [selected]
  );

  const busy = phase !== 'idle';

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={close} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('labs.title')}</Text>
          <Text style={styles.headerSub}>{t('labs.subtitle')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Add buttons / progress ── */}
        {busy ? (
          <View style={styles.progressCard}>
            <AnimatedRobot size={54} mood="happy" />
            <ActivityIndicator color="#6d5ef9" style={{ marginTop: 8 }} />
            <Text style={styles.progressTitle}>
              {phase === 'extracting' ? t('labs.extracting') : t('labs.generatingReport')}
            </Text>
            <Text style={styles.progressSub}>
              {phase === 'extracting' ? t('labs.extractingSub') : t('labs.generatingSub')}
            </Text>
          </View>
        ) : (
          <View style={styles.addRow}>
            <Pressable style={styles.addBtn} onPress={() => pickFrom('camera')}>
              <Text style={{ fontSize: 20 }}>📷</Text>
              <Text style={styles.addBtnText}>{t('labs.addCamera')}</Text>
            </Pressable>
            <Pressable style={styles.addBtn} onPress={() => pickFrom('gallery')}>
              <Text style={{ fontSize: 20 }}>🖼️</Text>
              <Text style={styles.addBtnText}>{t('labs.addGallery')}</Text>
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ── Empty state ── */}
        {!reports.length && !busy ? (
          <View style={styles.emptyWrap}>
            <Text style={{ fontSize: 44 }}>🧪</Text>
            <Text style={styles.emptyTitle}>{t('labs.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('labs.emptyBody')}</Text>
          </View>
        ) : null}

        {/* ── Report selector (horizontal) ── */}
        {reports.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 14 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {reports.map((r) => {
              const active = r.id === selected?.id;
              const danger = r.values.filter((v) => v.status === 'danger').length;
              const warn = r.values.filter((v) => v.status === 'warn').length;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setSelectedId(r.id)}
                  style={[styles.repChip, active && styles.repChipActive]}
                >
                  <Text
                    style={[styles.repChipTitle, active && { color: '#ffffff' }]}
                    numberOfLines={1}
                  >
                    {r.lab_name || t('labs.reportFallback')}
                  </Text>
                  <Text style={[styles.repChipDate, active && { color: 'rgba(255,255,255,0.75)' }]}>
                    {fmtDate(r.report_date ?? r.created_at)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
                    {danger > 0 ? (
                      <View style={[styles.chipBadge, { backgroundColor: '#ef4444' }]}>
                        <Text style={styles.chipBadgeText}>{danger}</Text>
                      </View>
                    ) : null}
                    {warn > 0 ? (
                      <View style={[styles.chipBadge, { backgroundColor: '#f59e0b' }]}>
                        <Text style={styles.chipBadgeText}>{warn}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.chipBadge, { backgroundColor: '#10b981' }]}>
                      <Text style={styles.chipBadgeText}>
                        {r.values.filter((v) => v.status === 'ok').length}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* ── Selected report detail ── */}
        {selected ? (
          <>
            {/* Summary card */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {selected.image_thumb ? (
                  <Pressable onPress={() => setLightbox(true)} style={styles.thumbWrap}>
                    <Image source={{ uri: selected.image_thumb }} style={styles.thumb} />
                  </Pressable>
                ) : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.repTitle}>
                    {selected.lab_name || t('labs.reportFallback')}
                  </Text>
                  <Text style={styles.repDate}>
                    {fmtDate(selected.report_date ?? selected.created_at)}
                  </Text>
                  {selected.summary ? (
                    <Text style={styles.repSummary}>{selected.summary}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.countRow}>
                <View style={[styles.countPill, { backgroundColor: STATUS.ok.bg }]}>
                  <Text style={[styles.countPillText, { color: STATUS.ok.text }]}>
                    {counts.ok} {t('labs.normal')}
                  </Text>
                </View>
                {counts.warn > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: STATUS.warn.bg }]}>
                    <Text style={[styles.countPillText, { color: STATUS.warn.text }]}>
                      {counts.warn} {t('labs.watch')}
                    </Text>
                  </View>
                ) : null}
                {counts.danger > 0 ? (
                  <View style={[styles.countPill, { backgroundColor: STATUS.danger.bg }]}>
                    <Text style={[styles.countPillText, { color: STATUS.danger.text }]}>
                      {counts.danger} {t('labs.critical')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* ── Voice doctor ── */}
            <View style={styles.voiceCard}>
              <AnimatedRobot size={46} mood="happy" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.voiceTitle}>{t('labs.voiceTitle')}</Text>
                <Text style={styles.voiceSub}>
                  {voice === 'preparing'
                    ? t('labs.voicePreparing')
                    : voice === 'speaking'
                      ? t('labs.voiceSpeaking')
                      : t('labs.voiceSub')}
                </Text>
              </View>
              {voice === 'speaking' ? <SpeakingBars active /> : null}
              <Pressable
                onPress={toggleVoice}
                style={[
                  styles.voiceBtn,
                  (voice === 'speaking' || voice === 'preparing') && styles.voiceBtnStop,
                ]}
              >
                {voice === 'preparing' ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={{ fontSize: 18, color: '#fff' }}>
                    {voice === 'speaking' ? '■' : '▶'}
                  </Text>
                )}
              </Pressable>
            </View>

            {/* ── Values by category ── */}
            {categories.map((cat) => {
              const catVals = selected.values.filter((v) => v.category === cat);
              const catDanger = catVals.filter((v) => v.status === 'danger').length;
              const catWarn = catVals.filter((v) => v.status === 'warn').length;
              return (
                <View key={cat} style={styles.card}>
                  <View style={styles.catHead}>
                    <Text style={styles.catTitle}>{cat}</Text>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      {catDanger > 0 ? (
                        <View style={[styles.chipBadge, { backgroundColor: '#ef4444' }]}>
                          <Text style={styles.chipBadgeText}>{catDanger}</Text>
                        </View>
                      ) : null}
                      {catWarn > 0 ? (
                        <View style={[styles.chipBadge, { backgroundColor: '#f59e0b' }]}>
                          <Text style={styles.chipBadgeText}>{catWarn}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.valueGrid}>
                    {catVals.map((v, i) => (
                      <ValueCard key={i} v={v} onPress={() => openValue(v)} />
                    ))}
                  </View>
                </View>
              );
            })}
            <Text style={styles.tapHint}>{t('labs.tapHint')}</Text>

            {/* ── Charts (if chosen) ── */}
            {selected.has_graphs !== false && selected.values.length > 0 ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>📊 {t('labs.distribution')}</Text>
                  <DonutChart values={selected.values} score={counts.score} />
                </View>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>📈 {t('labs.positioning')}</Text>
                  <PositionBars values={selected.values} />
                </View>
                {categories.length >= 3 ? (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>🕸️ {t('labs.byCategory')}</Text>
                    <RadarChart values={selected.values} />
                  </View>
                ) : null}
              </>
            ) : null}

            {/* ── Medical report ── */}
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>🩺 {t('labs.medicalReport')}</Text>
              {selected.medical_report ? (
                <>
                  <MdText text={selected.medical_report} />
                  <Text style={styles.disclaimer}>{t('labs.disclaimer')}</Text>
                </>
              ) : phase === 'reporting' ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <ActivityIndicator color="#6d5ef9" />
                  <Text style={styles.progressSub}>{t('labs.generatingSub')}</Text>
                </View>
              ) : (
                <Pressable style={styles.generateBtn} onPress={generateReportNow}>
                  <Text style={styles.generateBtnText}>{t('labs.generateReport')}</Text>
                </Pressable>
              )}
            </View>

            {/* ── Ask the AI ── */}
            <View style={styles.askCard}>
              <Text style={styles.askTitle}>{t('labs.askTitle')}</Text>
              <Text style={styles.askSub}>{t('labs.askSub')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable style={[styles.askBtn, { backgroundColor: '#19c37d' }]} onPress={askByCall}>
                  <Text style={{ fontSize: 17 }}>📞</Text>
                  <Text style={styles.askBtnText}>{t('labs.askCall')}</Text>
                </Pressable>
                <Pressable style={[styles.askBtn, { backgroundColor: '#6d5ef9' }]} onPress={askByChat}>
                  <Text style={{ fontSize: 17 }}>💬</Text>
                  <Text style={styles.askBtnText}>{t('labs.askChat')}</Text>
                </Pressable>
              </View>
            </View>

            {/* ── Delete ── */}
            <Pressable onPress={() => onDelete(selected)} style={styles.deleteRow}>
              <Text style={styles.deleteText}>🗑️ {t('labs.deleteTitle')}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>

      {/* ── "What do you want to generate?" modal ── */}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('labs.extractedTitle')}</Text>
            <Text style={styles.modalSub}>
              {t('labs.extractedSub', { count: pending?.values.length ?? 0 })}
            </Text>
            {pending?.summary ? (
              <Text style={styles.modalSummary}>{pending.summary}</Text>
            ) : null}
            <Text style={styles.modalChoose}>{t('labs.chooseWhat')}</Text>

            <Pressable
              style={[styles.choiceRow, wantGraphs && styles.choiceRowOn]}
              onPress={() => setWantGraphs((v) => !v)}
            >
              <Text style={{ fontSize: 18 }}>{wantGraphs ? '✅' : '⬜'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>{t('labs.optGraphs')}</Text>
                <Text style={styles.choiceSub}>{t('labs.optGraphsSub')}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[styles.choiceRow, wantReport && styles.choiceRowOn]}
              onPress={() => setWantReport((v) => !v)}
            >
              <Text style={{ fontSize: 18 }}>{wantReport ? '✅' : '⬜'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceTitle}>{t('labs.optReport')}</Text>
                <Text style={styles.choiceSub}>{t('labs.optReportSub')}</Text>
              </View>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable style={styles.modalConfirm} onPress={confirmGenerate}>
                <Text style={styles.modalConfirmText}>
                  {wantGraphs || wantReport ? t('labs.generate') : t('labs.saveOnly')}
                </Text>
              </Pressable>
              <Pressable style={styles.modalCancel} onPress={() => setPending(null)}>
                <Text style={styles.modalCancelText}>{t('profile.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Per-value AI explanation modal ── */}
      <Modal
        visible={!!valueModal}
        transparent
        animationType="slide"
        onRequestClose={() => setValueModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '84%' }]}>
            {valueModal ? (
              <>
                <View style={styles.valueModalHead}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.modalTitle}>{valueModal.label}</Text>
                    <Text
                      style={[styles.valueModalNum, { color: STATUS[valueModal.status].text }]}
                    >
                      {valueModal.value} {valueModal.unit}
                      {valueModal.refMin !== null && valueModal.refMax !== null
                        ? `   (${valueModal.refMin} – ${valueModal.refMax})`
                        : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => setValueModal(null)} style={styles.modalClose}>
                    <Text style={{ fontSize: 16, color: '#5b6472' }}>✕</Text>
                  </Pressable>
                </View>
                <ScrollView style={{ marginTop: 10 }} showsVerticalScrollIndicator={false}>
                  {valueText === null ? (
                    <View style={{ alignItems: 'center', paddingVertical: 26 }}>
                      <ActivityIndicator color="#6d5ef9" />
                      <Text style={styles.progressSub}>{t('labs.analyzingValue')}</Text>
                    </View>
                  ) : (
                    <MdText text={valueText} />
                  )}
                  <View style={{ height: 16 }} />
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Lightbox ── */}
      <Modal visible={lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(false)}>
        <Pressable style={styles.lightboxBackdrop} onPress={() => setLightbox(false)}>
          {selected?.image_thumb ? (
            <Image
              source={{ uri: selected.image_thumb }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: { fontFamily: F800, fontSize: 16.5, color: '#111827' },
  headerSub: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 1 },

  addRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e2e6ef',
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 14,
  },
  addBtnText: { fontFamily: F700, fontSize: 12.5, color: '#3b4657' },

  progressCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 20,
    marginTop: 8,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  progressTitle: { fontFamily: F700, fontSize: 13.5, color: '#111827', marginTop: 8 },
  progressSub: {
    fontFamily: F500,
    fontSize: 11.5,
    color: '#8b93a7',
    marginTop: 3,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  errorText: {
    fontFamily: F600,
    fontSize: 12,
    color: '#b91c1c',
    backgroundColor: '#fdeaea',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 10,
    textAlign: 'center',
  },

  emptyWrap: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: F800, fontSize: 16, color: '#111827', marginTop: 10 },
  emptyBody: {
    fontFamily: F500,
    fontSize: 12.5,
    color: '#8b93a7',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  repChip: {
    width: 148,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e6e9f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  repChipActive: { backgroundColor: '#6d5ef9', borderColor: '#6d5ef9' },
  repChipTitle: { fontFamily: F700, fontSize: 12, color: '#26313f' },
  repChipDate: { fontFamily: F500, fontSize: 10.5, color: '#8b93a7', marginTop: 1 },
  chipBadge: {
    minWidth: 20,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chipBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#ffffff' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  thumbWrap: {
    width: 62,
    height: 62,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e6e9f0',
  },
  thumb: { width: '100%', height: '100%' },
  repTitle: { fontFamily: F800, fontSize: 14.5, color: '#111827' },
  repDate: { fontFamily: F500, fontSize: 11, color: '#8b93a7', marginTop: 2 },
  repSummary: {
    fontFamily: F600,
    fontSize: 12,
    color: '#3b4657',
    marginTop: 6,
    lineHeight: 17,
  },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  countPill: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  countPillText: { fontFamily: F700, fontSize: 11 },

  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f3f0ff',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  voiceTitle: { fontFamily: F800, fontSize: 13.5, color: '#111827' },
  voiceSub: { fontFamily: F500, fontSize: 11, color: '#6d5ef9', marginTop: 2 },
  voiceBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#6d5ef9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6d5ef9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  voiceBtnStop: { backgroundColor: '#ef4444', shadowColor: '#ef4444' },

  catHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  catTitle: { fontFamily: F800, fontSize: 13, color: '#111827', flex: 1 },
  valueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  valueCard: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  valueCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
  },
  valueLabel: { fontFamily: F600, fontSize: 10.5, color: '#5b6472', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  valueNum: { fontFamily: F800, fontSize: 18 },
  valueUnit: { fontFamily: F500, fontSize: 10, color: '#8b93a7' },
  rangeTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.07)',
    overflow: 'hidden',
  },
  rangeFill: { height: '100%', borderRadius: 3 },
  rangeRef: { fontFamily: F500, fontSize: 9, color: '#8b93a7' },
  tapHint: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#a6aebc',
    textAlign: 'center',
    marginTop: 8,
  },

  sectionTitle: { fontFamily: F800, fontSize: 13.5, color: '#111827', marginBottom: 12 },
  legendLabel: { fontFamily: F600, fontSize: 12, color: '#3b4657', flex: 1 },
  legendCount: { fontFamily: F800, fontSize: 15 },
  chartHint: { fontFamily: F500, fontSize: 10, color: '#a6aebc', marginTop: 2 },

  posHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  posLabel: { fontFamily: F600, fontSize: 11, color: '#3b4657', flex: 1 },
  posValue: { fontFamily: F700, fontSize: 11 },
  posTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f1f3f8',
    position: 'relative',
    overflow: 'visible',
  },
  posNormalZone: {
    position: 'absolute',
    left: '20%',
    right: '20%',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderRadius: 5,
  },
  posCenterLine: {
    position: 'absolute',
    left: '50%',
    top: -2,
    bottom: -2,
    width: 1.5,
    backgroundColor: '#c4cad6',
  },
  posMarker: {
    position: 'absolute',
    top: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  mdLine: { fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#3b4657' },
  mdBullet: { paddingLeft: 10 },
  mdTitle: { marginTop: 8, fontSize: 13 },
  disclaimer: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#8b93a7',
    backgroundColor: '#f4f6fa',
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    lineHeight: 15,
  },
  generateBtn: {
    backgroundColor: '#6d5ef9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  generateBtnText: { fontFamily: F700, fontSize: 12.5, color: '#ffffff' },

  askCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
  },
  askTitle: { fontFamily: F800, fontSize: 14.5, color: '#ffffff' },
  askSub: {
    fontFamily: F500,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 4,
    lineHeight: 16,
  },
  askBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
  },
  askBtnText: { fontFamily: F800, fontSize: 13, color: '#ffffff' },

  deleteRow: { alignItems: 'center', marginTop: 16 },
  deleteText: { fontFamily: F600, fontSize: 12, color: '#c0410b' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
  },
  modalTitle: { fontFamily: F800, fontSize: 15, color: '#111827' },
  modalSub: { fontFamily: F600, fontSize: 12, color: '#0f7a45', marginTop: 4 },
  modalSummary: {
    fontFamily: F500,
    fontSize: 11.5,
    color: '#5b6472',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 16,
  },
  modalChoose: { fontFamily: F700, fontSize: 12.5, color: '#111827', marginTop: 14, marginBottom: 8 },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e6e9f0',
    backgroundColor: '#f8f9fc',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
  },
  choiceRowOn: { borderColor: '#b9aefc', backgroundColor: '#f3f0ff' },
  choiceTitle: { fontFamily: F700, fontSize: 12.5, color: '#111827' },
  choiceSub: { fontFamily: F500, fontSize: 10.5, color: '#8b93a7', marginTop: 1 },
  modalConfirm: {
    flex: 1,
    backgroundColor: '#6d5ef9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: { fontFamily: F700, fontSize: 13, color: '#ffffff' },
  modalCancel: {
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontFamily: F600, fontSize: 12.5, color: '#8b93a7' },

  valueModalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  valueModalNum: { fontFamily: F800, fontSize: 16, marginTop: 3 },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImg: { width: '94%', height: '84%' },
});
