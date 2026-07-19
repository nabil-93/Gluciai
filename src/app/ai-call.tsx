import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeleteConfirmCard, LoggerConfirmCard } from '@/components/LoggerConfirmCard';
import { AnimatedRobot, ChevronLeft, LockedScreen } from '@/components/ui';
import { isRTL } from '@/i18n';
import { nowMs } from '@/lib/clock';
import { isDemoMode, supabase } from '@/lib/supabase';
import { buildHealthContext, sendChatMessage } from '@/services/ai';
import {
  LIVE_LOG_INSTRUCTION,
  LIVE_LOG_TOOLS,
  actionFromFunctionCall,
  actionSummary,
  applyDeleteTarget,
  applyLoggerAction,
  findDeleteTargets,
  type DeletableKind,
  type DeleteTarget,
  type LoggerAction,
} from '@/services/aiLogger';
import {
  GeminiLiveSession,
  LIVE_MODELS,
  LIVE_VAD_TUNING,
  MicStreamer,
  PcmPlayer,
  getLiveToken,
} from '@/services/geminiLive';
import { useAppStore } from '@/store/useAppStore';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* Cost guards for the (expensive) live audio session:
 *  - hang up automatically after this many seconds of total silence
 *    (nobody speaking) so an idle open mic never bills forever,
 *  - and cap any single call so a forgotten call can't drain the quota. */
const SILENCE_TIMEOUT_MS = 25_000;
const MAX_CALL_MS = 5 * 60_000;

/* Classic fallback (SpeechRecognition) language tags */
const SR_LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-MA',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  en: 'English',
};

/** AI-voice volume chosen on the last call — survives leaving the screen
 *  (module scope) so the patient doesn't re-adjust on every call. */
let lastCallVolume = 1;
const VOLUME_MIN = 0.25;
const VOLUME_MAX = 2;
const VOLUME_STEP = 0.25;

type CallStatus =
  | 'incoming'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'unsupported';

/* ── Small SVG icons ── */
function MicIcon({ off = false, color = '#3b4657' }: { off?: boolean; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3z"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M6 11a6 6 0 0012 0M12 17v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      {off ? (
        <Path d="M4 4l16 16" stroke="#ef4444" strokeWidth={2.4} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}
function PhoneDownIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path
        d="M3.5 14.5c5-4.5 12-4.5 17 0l-2 3c-.6.9-1.8 1.2-2.8.7l-2-1a2 2 0 01-1.1-1.8v-1.2a13 13 0 00-5.2 0v1.2a2 2 0 01-1.1 1.8l-2 1c-1 .5-2.2.2-2.8-.7l-2-3z"
        fill="#ffffff"
      />
    </Svg>
  );
}
function PhoneUpIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24">
      <Path
        d="M6.6 10.8a15.5 15.5 0 006.6 6.6l2.2-2.2a1.4 1.4 0 011.5-.3c1.2.4 2.5.6 3.8.6.8 0 1.4.6 1.4 1.4v3.4c0 .8-.6 1.4-1.4 1.4C11.2 21.7 2.3 12.8 2.3 3.3c0-.8.6-1.4 1.4-1.4h3.4c.8 0 1.4.6 1.4 1.4 0 1.3.2 2.6.6 3.8.2.5 0 1.1-.3 1.5l-2.2 2.2z"
        fill="#ffffff"
      />
    </Svg>
  );
}
function SpeakerIcon({ off = false, color = '#3b4657' }: { off?: boolean; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M4 9v6h4l5 4V5L8 9H4z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      {off ? (
        <Path d="M17 9l4 6M21 9l-4 6" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
      ) : (
        <Path
          d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  );
}
function BulbIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"
        stroke="#8a3ffc"
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M10 20h4" stroke="#8a3ffc" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Animated voice waveform — bars dance while the call is active. */
function Waveform({ active }: { active: boolean }) {
  const N = 27;
  const vals = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;
  useEffect(() => {
    if (!active) {
      vals.forEach((v) => v.setValue(0.18));
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(v, {
            toValue: 1,
            duration: 260 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 260 + i * 40,
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

  const base = (i: number) => {
    const d = Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
    return 8 + (1 - d * d) * 22;
  };
  return (
    <View style={styles.waveRow}>
      {Array.from({ length: N }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            { height: base(i), transform: [{ scaleY: vals[i % 5] }] },
          ]}
        />
      ))}
    </View>
  );
}

/* Blocked from the admin dashboard, or monthly call minutes spent?
 * Show the lock instead of the call. The quota is checked server-side
 * (my_call_minutes_left RPC) before the expensive live session starts. */
export default function AiCallScreenGate() {
  const locked = useAppStore((s) => s.lockedFeatures.includes('ai_call'));
  const { t } = useTranslation();
  const [quota, setQuota] = useState<'checking' | 'ok' | 'exceeded'>('checking');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isDemoMode || !supabase) {
        if (alive) setQuota('ok');
        return;
      }
      try {
        const { data, error } = await supabase.rpc('my_call_minutes_left');
        if (!alive) return;
        setQuota(!error && typeof data === 'number' && data <= 0 ? 'exceeded' : 'ok');
      } catch {
        if (alive) setQuota('ok'); // never block on a transient error
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (locked) return <LockedScreen featureLabel={t('locked.featCall')} />;
  if (quota === 'exceeded')
    return <LockedScreen featureLabel={t('locked.featCall')} variant="quota" />;
  if (quota === 'checking') return <CallQuotaSplash />;
  return <AiCallScreen />;
}

/** Tiny neutral splash while the quota RPC resolves (usually <150 ms). */
function CallQuotaSplash() {
  return <View style={{ flex: 1, backgroundColor: '#0b1220' }} />;
}

function AiCallScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const profile = useAppStore((s) => s.profile);
  /** Opened from the lab-analysis screen → the AI opens the call itself. */
  const fromLab = from === 'lab';

  const [status, setStatus] = useState<CallStatus>('incoming');
  const [advice, setAdvice] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [volume, setVolume] = useState(lastCallVolume);
  const volumeRef = useRef(lastCallVolume);

  const statusRef = useRef<CallStatus>('incoming');
  const micOnRef = useRef(true);
  const speakerOnRef = useRef(true);
  const endedRef = useRef(false);
  const startedRef = useRef(false);
  const engineRef = useRef<'live' | 'classic' | null>(null);

  // Live engine
  const liveRef = useRef<GeminiLiveSession | null>(null);
  const micRef = useRef<MicStreamer | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  // Classic engine (SpeechRecognition + TTS fallback)
  const recRef = useRef<any>(null);
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);

  const setStatusSafe = (s: CallStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  /* Transcription chunks arrive many times per second; re-rendering the
   * whole screen on every chunk causes audio jank exactly while the AI is
   * speaking (part of the start-of-call stutter). Batch the advice-card
   * updates to ~4 per second instead. */
  const adviceBufRef = useRef<string | null>(null);
  const adviceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushAdvice = (text: string) => {
    adviceBufRef.current = text;
    if (adviceTimerRef.current) return;
    adviceTimerRef.current = setTimeout(() => {
      adviceTimerRef.current = null;
      if (!endedRef.current && adviceBufRef.current !== null) {
        setAdvice(adviceBufRef.current);
      }
    }, 250);
  };

  /** −/+ buttons: AI voice volume (live PCM gain; classic TTS caps at 1). */
  const changeVolume = (delta: number) => {
    const next = Math.min(
      VOLUME_MAX,
      Math.max(VOLUME_MIN, Math.round((volumeRef.current + delta) * 4) / 4)
    );
    volumeRef.current = next;
    lastCallVolume = next;
    setVolume(next);
    playerRef.current?.setVolume(next);
    // A tap is also a user gesture — piggyback to keep audio contexts alive.
    playerRef.current?.resume();
    micRef.current?.resume();
  };

  const langTag = SR_LANG_TAGS[i18n.language] ?? 'en-US';
  const SRClass =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const canClassic =
    !!SRClass && typeof window !== 'undefined' && !!(window as any).speechSynthesis;

  /* ── Call timer (starts once the call is answered) ── */
  const secondsRef = useRef(0);
  const callLoggedRef = useRef(false);
  const [endNotice, setEndNotice] = useState<string | null>(null);

  /* ── "Saved/deleted during the call" toast (full text) ── */
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSaved = (text: string) => {
    setSavedNotice(text);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedNotice(null), 6000);
  };

  /* ── CONFIRMATION GATE ──
   * The AI NEVER saves or deletes anything directly. Every log_* /
   * delete_entry tool call only creates a PENDING proposal: a card shows
   * on this screen and the tool answer says confirmation_required. The
   * proposal is executed only when the patient confirms — OUT LOUD (the
   * model then calls confirm_entry) or by TAPPING the card's button. */
  type CallPending =
    | { id: string; kind: 'log'; action: LoggerAction }
    | { id: string; kind: 'delete'; target: DeleteTarget };
  const [pending, setPending] = useState<CallPending | null>(null);
  const pendingRef = useRef<CallPending | null>(null);
  const pendingSeqRef = useRef(0);
  /** Last resolved proposal, so a re-sent confirm_entry gets a clean
   *  "already handled" answer instead of double-saving. */
  const lastResolvedRef = useRef<{
    id: string;
    outcome: 'saved' | 'deleted' | 'canceled';
  } | null>(null);
  const setPendingSafe = (p: CallPending | null) => {
    pendingRef.current = p;
    setPending(p);
  };

  /* ── Dedup guard against double-logging on a call ──
   * The patient may re-confirm ("yes, add it") after the entry was
   * already saved: recentSigRef maps a content signature → timestamp and
   * repeated saves within the window are answered already_saved. */
  const recentSigRef = useRef<Map<string, number>>(new Map());
  const DUP_WINDOW_MS = 90_000;

  const actionSignature = (a: ReturnType<typeof actionFromFunctionCall>) => {
    if (!a) return '';
    switch (a.type) {
      case 'insulin':
        return `insulin:${a.dose}:${a.insulin_type}`;
      case 'glucose':
        return `glucose:${a.value}`;
      case 'meal':
        return `meal:${a.name.toLowerCase().trim()}`;
      case 'activity':
        return `activity:${a.kind}:${a.duration_min}`;
      case 'measure':
        return `measure:${a.kind}:${a.value}`;
      case 'reminder':
        return `reminder:${a.message.toLowerCase().trim()}`;
      case 'note':
        return `note:${a.text.toLowerCase().trim()}`;
    }
  };

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  /** Toast + AI-journal trace once an entry is REALLY saved. */
  const afterSaved = (action: LoggerAction) => {
    const summary = actionSummary(action);
    showSaved(`✅ ${t('logger.addedShort')} · ${summary}`);
    useAppStore.getState().addAiJournalEntry({
      id: `log-${Date.now()}`,
      icon: '📝',
      title: t('logger.journalTitle'),
      body: summary,
      tone: 'success',
      created_at: new Date().toISOString(),
    });
  };
  /** Toast + AI-journal trace once an entry is REALLY deleted. */
  const afterDeleted = (target: DeleteTarget) => {
    showSaved(`🗑️ ${t('logger.deletedShort')} · ${target.summary}`);
    useAppStore.getState().addAiJournalEntry({
      id: `del-${Date.now()}`,
      icon: '🗑️',
      title: t('logger.journalDeleteTitle'),
      body: target.summary,
      tone: 'info',
      created_at: new Date().toISOString(),
    });
  };

  /* ── The patient resolved the proposal by TAPPING the card ──
   * Execute (or discard) it, then tell the model through a system text
   * turn so it acknowledges out loud and never re-proposes the entry. */
  const confirmPendingTap = async (finalAction?: LoggerAction) => {
    const p = pendingRef.current;
    if (!p || endedRef.current) return;
    bumpActivity();
    setPendingSafe(null);
    try {
      if (p.kind === 'log') {
        // Meals carry the moment picked on the card (breakfast/lunch/…).
        const action = finalAction ?? p.action;
        const sig = actionSignature(action);
        if (sig) recentSigRef.current.set(sig, nowMs());
        await applyLoggerAction(action);
        lastResolvedRef.current = { id: p.id, outcome: 'saved' };
        afterSaved(action);
        liveRef.current?.sendText(
          `(SYSTEM: the patient tapped the CONFIRM button on screen — the entry "${actionSummary(
            action
          )}" is now SAVED. Briefly acknowledge out loud in the patient's language. Do NOT call confirm_entry and do NOT propose it again.)`
        );
      } else {
        await applyDeleteTarget(p.target);
        lastResolvedRef.current = { id: p.id, outcome: 'deleted' };
        afterDeleted(p.target);
        liveRef.current?.sendText(
          `(SYSTEM: the patient tapped the CONFIRM button on screen — the entry "${p.target.summary}" was DELETED. Briefly acknowledge out loud in the patient's language. Do NOT call confirm_entry.)`
        );
      }
    } catch {
      // Save/delete failed — put the card back so the patient can retry.
      setPendingSafe(p);
    }
  };

  const cancelPendingTap = () => {
    const p = pendingRef.current;
    if (!p || endedRef.current) return;
    bumpActivity();
    lastResolvedRef.current = { id: p.id, outcome: 'canceled' };
    setPendingSafe(null);
    const summary = p.kind === 'log' ? actionSummary(p.action) : p.target.summary;
    liveRef.current?.sendText(
      `(SYSTEM: the patient tapped the CANCEL button on screen — the proposal "${summary}" was DISCARDED, nothing was saved or deleted. Briefly acknowledge out loud and ask if they want to change something.)`
    );
  };

  /* ── Cost guards: silence timeout + hard cap ── */
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Declared here, assigned after endCall exists (avoids TS use-before-def).
  const endForReasonRef = useRef<(reason: 'silence' | 'max') => void>(() => {});
  const endCallRef = useRef<() => void>(() => {});

  /* ── Graceful hang-up when the patient says goodbye ──
   * The model says a short goodbye out loud and calls the end_call tool.
   * We wait for that farewell to finish playing (player drain), then close.
   * A ceiling timer guarantees we hang up even if no more audio arrives. */
  const hangupPendingRef = useRef(false);
  const hangupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Belt-and-suspenders: we ALSO listen to the patient's own words (input
   * transcription). If they clearly said goodbye, the call closes right
   * after the model's reply finishes — even when the model forgets to
   * call the end_call tool. */
  const userFarewellRef = useRef(false);
  const farewellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTurnBufRef = useRef('');
  const FAREWELL_RE =
    /\b(b['e]?slam+a|bslema|besslama|au revoir|good ?bye|bye+|tsch[üu]ss|auf wiedersehen|thal+a)\b|بالسلامة|بسلامة|مع السلامة|وداعا|تهلا|إلى اللقاء/i;
  const scheduleHangup = () => {
    if (endedRef.current || hangupPendingRef.current) return;
    hangupPendingRef.current = true;
    // The model speaks a short farewell around the end_call tool; the audio
    // may still be streaming in. Never cut it off: after a short grace, if
    // it's still playing keep waiting (player.onDrain ends it the instant the
    // goodbye finishes); only close once nothing is left to play.
    const tick = () => {
      if (endedRef.current) return;
      if (playerRef.current?.isPlaying?.()) {
        hangupTimerRef.current = setTimeout(tick, 1000);
        return;
      }
      endCallRef.current();
    };
    if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
    hangupTimerRef.current = setTimeout(tick, 1500);
  };

  const clearGuardTimers = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (hangupTimerRef.current) clearTimeout(hangupTimerRef.current);
    if (farewellTimerRef.current) clearTimeout(farewellTimerRef.current);
    if (adviceTimerRef.current) clearTimeout(adviceTimerRef.current);
    silenceTimerRef.current = null;
    maxTimerRef.current = null;
    hangupTimerRef.current = null;
    farewellTimerRef.current = null;
    adviceTimerRef.current = null;
  };
  /** Reset the silence countdown — called on any speech (mic or AI). */
  const bumpActivity = () => {
    if (endedRef.current || !startedRef.current) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(
      () => endForReasonRef.current('silence'),
      SILENCE_TIMEOUT_MS
    );
  };
  const startGuardTimers = () => {
    bumpActivity();
    maxTimerRef.current = setTimeout(() => endForReasonRef.current('max'), MAX_CALL_MS);
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (startedRef.current && !endedRef.current) {
        secondsRef.current += 1;
        setSeconds((s) => s + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  /** Persist call duration + EXACT Gemini Live token usage (best-effort).
   *  Prices: gemini-3.1-flash-live-preview, USD per 1M tokens
   *  (text in $0.75 · audio in $3.00 · text out $4.50 · audio out $12.00). */
  const logCallDuration = () => {
    if (callLoggedRef.current || secondsRef.current < 1) return;
    callLoggedRef.current = true;
    const duration = secondsRef.current;
    // Read the session totals synchronously — cleanup nulls liveRef right after.
    const usage = liveRef.current?.getUsageTotals() ?? null;
    if (isDemoMode || !supabase) return;
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) return;
        await supabase.from('call_logs').insert({
          user_id: uid,
          duration_sec: duration,
          language: i18n.language,
        });
        const tokens =
          (usage?.textIn ?? 0) + (usage?.audioIn ?? 0) + (usage?.textOut ?? 0) + (usage?.audioOut ?? 0);
        if (usage && tokens > 0) {
          const cost =
            (usage.textIn * 0.75 + usage.audioIn * 3.0 + usage.textOut * 4.5 + usage.audioOut * 12.0) /
            1_000_000;
          await supabase.from('ai_usage').insert({
            user_id: uid,
            kind: 'call',
            model: LIVE_MODELS[0],
            input_tokens: usage.textIn,
            output_tokens: usage.textOut,
            audio_input_tokens: usage.audioIn,
            audio_output_tokens: usage.audioOut,
            cost_usd: cost,
          });
        }
      } catch {
        // logging only
      }
    })();
  };

  /** System instruction shared by both engines: the patient's language +
   *  full health snapshot + phone-call speaking style. */
  const buildInstruction = () => {
    const langName = LANGUAGE_NAMES[i18n.language] ?? 'English';
    const opening = fromLab
      ? `THIS CALL WAS OPENED FROM THE PATIENT'S LAB-ANALYSIS SCREEN: their
blood-test results are in PATIENT DATA below (LAB REPORT). YOU open the
call (you will receive a directive): tell them you have read their
analysis and ask what they want to know. After that, mirror their
language as described below and answer their questions about the
results, honestly and simply.`
      : `THE PATIENT SPEAKS FIRST: stay completely SILENT until the patient talks
(they open with "salam", "bonjour", "hello", "hola", "merhaba"…). NEVER
speak first. When they do speak, DETECT the language or dialect of THEIR
words and answer with one short warm greeting in that SAME language,
calling them by their first name (it is in PATIENT DATA below,
"Profile: name …"), then help them. Example: patient says "salam" in
Moroccan Darija → you answer in Darija like "Salam [name], ana GluciAI.
Kidayr lyoum?".`;
    return `You are GluciAI, the patient's personal diabetes assistant, on a LIVE PHONE CALL.
${opening}
LANGUAGE (critical): ALWAYS mirror whatever language or dialect the
patient actually speaks — ANY language in the world: French, German,
English, Spanish, Italian, Turkish, Arabic (any dialect: Moroccan
DARIJA, Egyptian, Gulf…), Tamazight, or anything else. If they speak
Darija, reply in Darija (NOT in French, NOT in formal Arabic). If they
speak Spanish, reply in Spanish — and so on for every language. Switch
instantly whenever they switch mid-call. ${langName} (the app language)
is only a last-resort fallback when you truly cannot tell. You
understand them all; never say you don't understand, never ask them to
switch language.
STYLE: natural, warm, short spoken sentences (1-3 per turn), like a caring human
on the phone. No lists, no markdown. It's OK to ask short follow-up questions.
NAME: use the patient's first name naturally now and then — never say "?"
if the name is missing, just speak warmly without a name.
CHECK THEIR DATA: when the patient mentions they ate or did something
today ("klit tajine", "jrit chi chwiya"), look it up in PATIENT DATA — if
it is not logged there, tell them so and offer to add it (see LOGGING).
BE CONCRETELY HELPFUL: give real practical suggestions (foods, portions, timing,
hydration, activity) and analyse the patient's own data when asked — never refuse
with "I can't judge". Insulin education with their own ratios is fine; just never
impose a new dose as a prescription.
IMPORTANT: whenever you give ANY advice or suggestion, add one short natural
spoken sentence that this is only your suggestion and they should check with
their doctor (e.g. "but this is just my advice, your doctor knows best"). Say
it naturally, not every single turn — only when you actually advised something.
PATIENT DATA (live from the app — use it to answer questions about meals,
glucose, insulin, parameters):
${buildHealthContext()}
${LIVE_LOG_INSTRUCTION}`;
  };

  /* ────────────── LIVE ENGINE (Gemini Live API) ────────────── */
  const startLive = async (player: PcmPlayer, mic: MicStreamer): Promise<boolean> => {
    if (Platform.OS !== 'web') return false;
    const token = await getLiveToken();
    if (!token || endedRef.current) return false;

    playerRef.current = player;
    player.setVolume(volumeRef.current);
    player.onDrain = (underrun) => {
      // Speaker went quiet → stop gating the mic (echo can't happen now).
      mic.setEchoGate(false);
      if (endedRef.current) return;
      // The patient said goodbye: once the farewell has finished playing, close.
      if (hangupPendingRef.current) {
        // Mid-sentence network gap during the farewell → more audio is
        // coming, let the next drain (or the hangup ceiling) close the call.
        if (!underrun) endCallRef.current();
        return;
      }
      // A mid-turn under-run is NOT the end of the AI's sentence — keep
      // showing "speaking" so the status doesn't flicker while it resumes.
      if (!underrun && statusRef.current === 'speaking') {
        setStatusSafe(micOnRef.current ? 'listening' : 'muted');
      }
    };

    const session = new GeminiLiveSession({
      onAudio: (chunk) => {
        if (endedRef.current) return;
        bumpActivity(); // AI is speaking → not silent
        // While the AI's voice is on the speaker, gate the mic: quiet
        // frames (its own echo, room noise) go out as silence so the
        // model never thinks the patient barged in and cuts its answer.
        mic.setEchoGate(true);
        player.play(chunk);
        if (statusRef.current !== 'speaking') setStatusSafe('speaking');
      },
      onText: (text) => pushAdvice(text),
      onUserText: (text) => {
        // The patient's own words (input transcription). Watch for a clear
        // goodbye so the call ALWAYS hangs up, even if the model forgets
        // to call the end_call tool.
        if (endedRef.current) return;
        bumpActivity();
        userTurnBufRef.current = (userTurnBufRef.current + ' ' + text).slice(-160);
        if (!userFarewellRef.current && FAREWELL_RE.test(userTurnBufRef.current)) {
          userFarewellRef.current = true;
          // Ceiling: close even if the model never answers the goodbye.
          farewellTimerRef.current = setTimeout(() => {
            if (!endedRef.current) endCallRef.current();
          }, 12_000);
        }
      },
      onInterrupted: () => {
        // The patient is really talking — stop gating so every nuance of
        // their speech reaches the model.
        mic.setEchoGate(false);
        player.clear();
        if (!endedRef.current) {
          setStatusSafe(micOnRef.current ? 'listening' : 'muted');
        }
      },
      onTurnComplete: () => {
        // Normal end of the model's speech — a queue drain after this is
        // completion, not a network under-run (jitter-buffer bookkeeping).
        player.endOfTurn();
        if (!player.isPlaying()) mic.setEchoGate(false);
        // Fresh user turn starts after each model turn.
        userTurnBufRef.current = '';
        // The patient said goodbye and the model finished its reply →
        // hang up as soon as the farewell audio finishes playing.
        if (userFarewellRef.current && !endedRef.current) {
          hangupPendingRef.current = true;
          if (!playerRef.current?.isPlaying?.()) endCallRef.current();
        }
        // Otherwise status flips back on player drain; nothing to do.
      },
      onToolCall: (calls) => {
        // CONFIRMATION GATE: log_* / delete_entry only CREATE a pending
        // proposal (card on screen + confirmation_required answer);
        // confirm_entry executes it after the patient's verbal yes;
        // cancel_entry discards it. Nothing is ever saved or deleted
        // without the patient's explicit confirmation.
        if (endedRef.current) return;
        bumpActivity();
        const answer = (
          c: (typeof calls)[number],
          response: Record<string, unknown>
        ) =>
          liveRef.current?.sendToolResponse([
            { id: c.id, name: c.name, response },
          ]);

        for (const c of calls) {
          // The patient said goodbye → the model asks to hang up. Ack the
          // tool so it can finish its spoken farewell, then close gracefully.
          if (c.name === 'end_call') {
            answer(c, { ok: true });
            scheduleHangup();
            continue;
          }

          if (c.name === 'cancel_entry') {
            const p = pendingRef.current;
            if (p) {
              lastResolvedRef.current = { id: p.id, outcome: 'canceled' };
              setPendingSafe(null);
            }
            answer(c, { ok: true, canceled: true, note: 'Nothing was saved or deleted.' });
            continue;
          }

          if (c.name === 'confirm_entry') {
            const pid = String((c.args as Record<string, unknown>)?.pending_id ?? '');
            const p = pendingRef.current;
            if (!p || (pid && pid !== p.id)) {
              const last = lastResolvedRef.current;
              if (last && (!pid || pid === last.id)) {
                answer(c, {
                  ok: true,
                  already_done: true,
                  outcome: last.outcome,
                  note: 'Already handled — do not confirm or propose it again.',
                });
              } else {
                answer(c, { ok: false, error: 'nothing pending to confirm' });
              }
              continue;
            }
            setPendingSafe(null);
            if (p.kind === 'log') {
              // Reserve the signature BEFORE the async save so a duplicate
              // arriving during the save can't slip through.
              const sig = actionSignature(p.action);
              if (sig) recentSigRef.current.set(sig, Date.now());
              void applyLoggerAction(p.action)
                .then(() => {
                  lastResolvedRef.current = { id: p.id, outcome: 'saved' };
                  answer(c, { ok: true, saved: true });
                  afterSaved(p.action);
                })
                .catch(() => {
                  if (sig) recentSigRef.current.delete(sig);
                  setPendingSafe(p); // card comes back so the patient can retry
                  answer(c, { ok: false, error: 'save failed' });
                });
            } else {
              void applyDeleteTarget(p.target)
                .then(() => {
                  lastResolvedRef.current = { id: p.id, outcome: 'deleted' };
                  answer(c, { ok: true, deleted: true });
                  afterDeleted(p.target);
                })
                .catch(() => {
                  setPendingSafe(p);
                  answer(c, { ok: false, error: 'delete failed' });
                });
            }
            continue;
          }

          if (c.name === 'delete_entry') {
            const args = (c.args ?? {}) as Record<string, unknown>;
            const KINDS: DeletableKind[] = [
              'insulin', 'glucose', 'meal', 'activity', 'measure', 'note', 'reminder',
            ];
            const kind = KINDS.includes(args.kind as DeletableKind)
              ? (args.kind as DeletableKind)
              : undefined;
            const query = typeof args.query === 'string' ? args.query : undefined;
            const targets = findDeleteTargets({ kind, query });
            if (!targets.length) {
              answer(c, {
                ok: false,
                error: 'not_found',
                todays_entries: findDeleteTargets({})
                  .slice(0, 12)
                  .map((x) => x.summary),
                note: "No entry matched. Read todays_entries to the patient, ask which one they mean, then call delete_entry again with better identifying words.",
              });
              continue;
            }
            const target = targets[0];
            const cur = pendingRef.current;
            if (cur?.kind === 'delete' && cur.target.rowId === target.rowId) {
              answer(c, {
                ok: false,
                status: 'confirmation_required',
                pending_id: cur.id,
                entry: cur.target.summary,
                note: 'Already proposed — ask the patient to confirm (say yes, or tap the button on screen).',
              });
              continue;
            }
            const pid = `p${++pendingSeqRef.current}`;
            setPendingSafe({ id: pid, kind: 'delete', target });
            answer(c, {
              ok: false,
              status: 'confirmation_required',
              pending_id: pid,
              entry: target.summary,
              ...(targets.length > 1
                ? { other_matches: targets.slice(1, 4).map((x) => x.summary) }
                : {}),
              note: "NOT deleted yet. A red confirmation card is on the patient's screen. Read the entry back out loud and ask them to confirm: they can say yes (then call confirm_entry with this pending_id) or tap the button on screen.",
            });
            continue;
          }

          // log_* / set_reminder → create a pending proposal, never save.
          const action = actionFromFunctionCall(c.name, c.args);
          if (!action) {
            answer(c, { ok: false, error: 'invalid arguments' });
            continue;
          }
          // Same content saved moments ago (patient re-confirmed) → tell
          // the model it's already recorded instead of proposing again.
          const sig = actionSignature(action);
          const last = sig ? recentSigRef.current.get(sig) : undefined;
          if (sig && last && Date.now() - last < DUP_WINDOW_MS) {
            answer(c, {
              ok: true,
              already_saved: true,
              note: 'already recorded, do not add again',
            });
            continue;
          }
          // Same proposal re-sent while its card is still open → re-ack.
          const cur = pendingRef.current;
          if (cur?.kind === 'log' && actionSignature(cur.action) === sig) {
            answer(c, {
              ok: false,
              status: 'confirmation_required',
              pending_id: cur.id,
              entry: actionSummary(cur.action),
              note: 'Already proposed — ask the patient to confirm (say yes, or tap the button on screen).',
            });
            continue;
          }
          const pid = `p${++pendingSeqRef.current}`;
          setPendingSafe({ id: pid, kind: 'log', action });
          answer(c, {
            ok: false,
            status: 'confirmation_required',
            pending_id: pid,
            entry: actionSummary(action),
            note: "NOT SAVED YET. A green confirmation card is on the patient's screen. Read the entry back out loud and ask them to confirm: they can say yes (then call confirm_entry with this pending_id) or tap the button on screen (you will get a system message).",
          });
        }
      },
      onClose: () => {
        // Connection dropped mid-call → seamlessly fall back to classic.
        if (!endedRef.current && engineRef.current === 'live') {
          cleanupLive();
          if (canClassic) {
            engineRef.current = 'classic';
            startClassicLoop();
          } else {
            setStatusSafe('unsupported');
          }
        }
      },
    });
    liveRef.current = session;

    const instruction = buildInstruction();
    // Each model is tried WITH the anti-cutout VAD tuning first; if a
    // server build rejects that setup, the SAME model is retried without
    // it — the live engine must never fall back to classic just because
    // of the tuning.
    const setupAttempts: (Record<string, unknown> | undefined)[] = [
      LIVE_VAD_TUNING,
      undefined,
    ];
    for (const model of LIVE_MODELS) {
      for (const setupExtras of setupAttempts) {
        if (endedRef.current) return false;
        try {
          // No forced speech languageCode: the patient speaks FIRST and the
          // model mirrors their language/dialect (Darija included) — a fixed
          // BCP-47 tag would lock the voice to the app language.
          await session.connect(
            token,
            model,
            instruction,
            undefined,
            8000,
            LIVE_LOG_TOOLS,
            setupExtras
          );
          // Connected — start streaming the mic (its AudioContext was
          // created inside the answer tap, so iOS lets it run). The call is
          // now silently listening: the PATIENT opens the conversation
          // ("salam…") and the model greets back in the same language.
          micRef.current = mic;
          await mic.start((b64) => session.sendAudio(b64));
          mic.setMuted(!micOnRef.current);
          // From the lab screen the AI opens the call itself: "I've read your
          // analysis — what would you like to ask?" (normal calls stay silent
          // until the patient speaks first).
          if (fromLab) {
            session.sendText(
              `(The call just connected from the patient's lab-analysis screen. ` +
                `YOU speak first: in 1-2 short warm spoken sentences in ` +
                `${LANGUAGE_NAMES[i18n.language] ?? 'English'}, greet the patient by ` +
                `their first name, tell them you have read their blood-test ` +
                `analysis, and ask what they would like to know about it. Then wait ` +
                `for their reply and switch to THEIR language/dialect from then on.)`
            );
          }
          if (!endedRef.current) {
            setStatusSafe(micOnRef.current ? 'listening' : 'muted');
          }
          return true;
        } catch {
          // try without the VAD tuning, then the next model, same token
        }
      }
    }
    cleanupLive();
    return false;
  };

  const cleanupLive = () => {
    try {
      liveRef.current?.close();
    } catch {}
    try {
      micRef.current?.stop();
    } catch {}
    try {
      playerRef.current?.close();
    } catch {}
    liveRef.current = null;
    micRef.current = null;
    playerRef.current = null;
  };

  /* ────────────── CLASSIC ENGINE (STT → Gemini → TTS) ────────────── */
  const startClassicListening = () => {
    if (endedRef.current || !canClassic || !micOnRef.current) return;
    setStatusSafe('listening');
    try {
      if (!recRef.current) {
        const rec = new SRClass();
        rec.lang = langTag;
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e: any) => {
          const text = e.results?.[0]?.[0]?.transcript?.trim();
          if (text) handleClassicSpeech(text);
        };
        rec.onend = () => {
          if (!endedRef.current && statusRef.current === 'listening' && micOnRef.current) {
            setTimeout(() => {
              try {
                recRef.current?.start();
              } catch {}
            }, 250);
          }
        };
        rec.onerror = () => {};
        recRef.current = rec;
      }
      recRef.current.start();
    } catch {}
  };

  const stopClassicListening = () => {
    try {
      recRef.current?.stop();
    } catch {}
  };

  const speakClassic = (text: string) => {
    if (endedRef.current) return;
    if (!speakerOnRef.current || !canClassic) {
      startClassicListening();
      return;
    }
    setStatusSafe('speaking');
    const synth = (window as any).speechSynthesis;
    synth.cancel();
    const u = new (window as any).SpeechSynthesisUtterance(text);
    u.lang = langTag;
    u.rate = 1;
    u.volume = Math.min(1, volumeRef.current);
    u.onend = () => {
      if (!endedRef.current) startClassicListening();
    };
    u.onerror = () => {
      if (!endedRef.current) startClassicListening();
    };
    synth.speak(u);
  };

  const handleClassicSpeech = async (text: string) => {
    stopClassicListening();
    setStatusSafe('thinking');
    historyRef.current = [...historyRef.current, { role: 'user', content: text }];
    try {
      const reply = await sendChatMessage(
        historyRef.current,
        i18n.language,
        profile,
        'voice'
      );
      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: reply },
      ];
      setAdvice(reply);
      speakClassic(reply);
    } catch {
      setAdvice(t('common.error'));
      startClassicListening();
    }
  };

  const startClassicLoop = () => {
    if (!canClassic) {
      setStatusSafe('unsupported');
      return;
    }
    // From the lab screen the AI opens the call ("I've read your analysis…");
    // otherwise the patient opens the conversation — start listening right
    // away (same behaviour as the live engine: the AI never speaks first).
    if (fromLab) {
      const intro = t('labs.callIntro');
      historyRef.current = [...historyRef.current, { role: 'assistant', content: intro }];
      setAdvice(intro);
      speakClassic(intro);
      return;
    }
    startClassicListening();
  };

  const cleanupClassic = () => {
    try {
      recRef.current?.abort?.();
      recRef.current?.stop?.();
    } catch {}
    try {
      (window as any).speechSynthesis?.cancel();
    } catch {}
    recRef.current = null;
  };

  /* ────────────── Answering the call ──────────────
   * Everything audio MUST begin inside this tap: iOS Safari only allows
   * AudioContexts created/resumed during a user gesture. The answer
   * button is also what makes it feel like picking up a real call. */
  const answerCall = () => {
    if (startedRef.current || endedRef.current) return;
    startedRef.current = true;

    if (Platform.OS !== 'web') {
      setStatusSafe('unsupported');
      return;
    }
    // Synchronously, within the gesture: create both audio contexts.
    const player = new PcmPlayer();
    const mic = new MicStreamer();
    mic.prepareContext();
    // Patient speech resets the silence-hangup countdown.
    mic.onSpeech = bumpActivity;
    setStatusSafe('connecting');
    startGuardTimers();

    (async () => {
      const liveOk = await startLive(player, mic);
      if (endedRef.current) return;
      if (liveOk) {
        engineRef.current = 'live';
      } else if (canClassic) {
        try {
          player.close();
          mic.stop();
        } catch {}
        engineRef.current = 'classic';
        startClassicLoop();
      } else {
        setStatusSafe('unsupported');
      }
    })();
  };

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      endedRef.current = true;
      clearGuardTimers();
      logCallDuration();
      cleanupLive();
      cleanupClassic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ────────────── Controls ────────────── */
  const toggleMic = () => {
    const next = !micOnRef.current;
    micOnRef.current = next;
    setMicOn(next);
    // iOS unlocks audio contexts on a user gesture — piggyback on the tap.
    micRef.current?.resume();
    playerRef.current?.resume();
    if (engineRef.current === 'live') {
      micRef.current?.setMuted(!next);
      if (statusRef.current === 'listening' || statusRef.current === 'muted') {
        setStatusSafe(next ? 'listening' : 'muted');
      }
    } else {
      if (!next) {
        stopClassicListening();
        if (statusRef.current === 'listening') setStatusSafe('muted');
      } else if (statusRef.current === 'muted') {
        startClassicListening();
      }
    }
  };

  const toggleSpeaker = () => {
    const next = !speakerOnRef.current;
    speakerOnRef.current = next;
    setSpeakerOn(next);
    micRef.current?.resume();
    playerRef.current?.resume();
    if (engineRef.current === 'live') {
      playerRef.current?.setMuted(!next);
    } else if (!next && statusRef.current === 'speaking') {
      try {
        (window as any).speechSynthesis?.cancel();
      } catch {}
      startClassicListening();
    }
  };

  const endCall = () => {
    endedRef.current = true;
    clearGuardTimers();
    logCallDuration();
    cleanupLive();
    cleanupClassic();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  // Assigned after endCall exists so the goodbye handler / player drain can
  // reach the latest version without a forward reference.
  endCallRef.current = endCall;

  /** Auto-hang-up from a cost guard: shows a short reason, then closes.
   *  Kept behind a ref so the guard timers (set up before this line) can
   *  call the latest version without a forward-reference. */
  endForReasonRef.current = (reason: 'silence' | 'max') => {
    if (endedRef.current) return;
    endedRef.current = true;
    clearGuardTimers();
    logCallDuration();
    cleanupLive();
    cleanupClassic();
    setEndNotice(reason === 'silence' ? t('call.endedSilence') : t('call.endedMax'));
    // Let the notice show briefly, then leave the screen.
    setTimeout(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }, 2600);
  };

  const statusText = endNotice
    ? endNotice
    : status === 'incoming'
      ? t('call.incoming')
      : status === 'connecting'
        ? t('call.connecting')
        : status === 'listening'
          ? t('call.listening')
          : status === 'thinking'
            ? t('call.thinking')
            : status === 'speaking'
              ? t('call.speaking')
              : status === 'muted'
                ? t('call.muted')
                : t('call.unsupported');

  const active = status === 'listening' || status === 'speaking';

  return (
    <View
      style={styles.root}
      // First touch anywhere unlocks the audio contexts on iOS Safari.
      // Any touch also counts as activity — the patient may be silently
      // reading a confirmation card; don't let the silence guard hang up.
      onTouchStart={() => {
        micRef.current?.resume();
        playerRef.current?.resume();
        bumpActivity();
      }}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={endCall} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('call.title')}</Text>
          <Text style={styles.headerSub}>{t('call.sub')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Robot in halo ── */}
      <View style={styles.stage}>
        <View style={styles.haloOuter}>
          <View style={styles.haloMid}>
            <View style={styles.haloInner}>
              <AnimatedRobot size={92} mood="happy" />
            </View>
          </View>
        </View>

        {/* Hidden while a confirmation card is open — keeps the card and
            the call controls on screen even on small phones. */}
        {pending ? null : <Waveform active={active} />}

        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.timer}>
          {mm}:{ss}
        </Text>
      </View>

      {/* ── Saved/deleted-during-call toast ── */}
      {savedNotice ? (
        <View style={styles.savedPill}>
          <Text style={styles.savedPillText}>{savedNotice}</Text>
        </View>
      ) : null}

      {/* ── Pending confirmation card (replaces the advice card while the
             AI waits for the patient's explicit yes — spoken OR tapped) ── */}
      {pending ? (
        <View style={styles.pendingWrap}>
          {pending.kind === 'log' ? (
            <LoggerConfirmCard
              action={pending.action}
              onConfirm={(a) => confirmPendingTap(a)}
              onCancel={cancelPendingTap}
            />
          ) : (
            <DeleteConfirmCard
              summary={pending.target.summary}
              createdAt={pending.target.created_at}
              onConfirm={() => confirmPendingTap()}
              onCancel={cancelPendingTap}
            />
          )}
        </View>
      ) : (
        /* ── Live advice card ── */
        <View style={styles.adviceCard}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.adviceKicker}>{t('call.adviceTitle')}</Text>
            <Text style={styles.adviceText} numberOfLines={4}>
              {advice ?? t('call.adviceEmpty')}
            </Text>
          </View>
          <View style={styles.adviceBulb}>
            <BulbIcon />
          </View>
        </View>
      )}

      {/* ── AI voice volume (−/+, 25% steps, up to 200% boost) ── */}
      {status !== 'incoming' ? (
        <View style={styles.volRow}>
          <Pressable
            onPress={() => changeVolume(-VOLUME_STEP)}
            style={styles.volBtn}
            hitSlop={8}
            disabled={volume <= VOLUME_MIN}
          >
            <Text style={[styles.volBtnText, volume <= VOLUME_MIN && styles.volBtnOff]}>
              −
            </Text>
          </Pressable>
          <Text style={styles.volValue}>🔊 {Math.round(volume * 100)}%</Text>
          <Pressable
            onPress={() => changeVolume(VOLUME_STEP)}
            style={styles.volBtn}
            hitSlop={8}
            disabled={volume >= VOLUME_MAX}
          >
            <Text style={[styles.volBtnText, volume >= VOLUME_MAX && styles.volBtnOff]}>
              +
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Controls ── */}
      {status === 'incoming' ? (
        /* Answer button — the call (audio contexts, mic, WebSocket) starts
           inside this tap, which is what iOS Safari requires. */
        <View style={styles.controls}>
          <View style={styles.controlCol}>
            <Pressable onPress={answerCall} style={styles.answerBtn}>
              <PhoneUpIcon />
            </Pressable>
            <Text style={[styles.controlLabel, { color: '#16955f' }]}>
              {t('call.answer')}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.controls}>
          <View style={styles.controlCol}>
            <Pressable
              onPress={toggleMic}
              style={[styles.roundBtn, !micOn && styles.roundBtnOff]}
              disabled={status === 'unsupported'}
            >
              <MicIcon off={!micOn} />
            </Pressable>
            <Text style={styles.controlLabel}>{t('call.mute')}</Text>
          </View>

          <View style={styles.controlCol}>
            <Pressable onPress={endCall} style={styles.endBtn}>
              <PhoneDownIcon />
            </Pressable>
            <Text style={styles.controlLabel}>{t('call.end')}</Text>
          </View>

          <View style={styles.controlCol}>
            <Pressable
              onPress={toggleSpeaker}
              style={[styles.roundBtn, !speakerOn && styles.roundBtnOff]}
              disabled={status === 'unsupported'}
            >
              <SpeakerIcon off={!speakerOn} />
            </Pressable>
            <Text style={styles.controlLabel}>{t('call.speaker')}</Text>
          </View>
        </View>
      )}

      {/* ── Safety note (hidden while a confirmation card needs the room) ── */}
      {pending ? null : (
        <View
          style={[
            styles.safetyCard,
            { marginBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <Text style={styles.safetyText}>{t('call.safety')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe', paddingHorizontal: 18 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginHorizontal: -18,
    paddingHorizontal: 16,
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

  stage: { alignItems: 'center', marginTop: 10 },
  haloOuter: {
    width: 208,
    height: 208,
    borderRadius: 104,
    backgroundColor: '#f0ebfd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloMid: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#e4dbfb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(90,60,180,1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },

  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    marginTop: 20,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#19c37d',
  },

  statusText: { fontFamily: F800, fontSize: 17, color: '#111827', marginTop: 14 },
  timer: { fontFamily: F600, fontSize: 13, color: '#8b93a7', marginTop: 4 },

  adviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f3f0ff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  savedPill: {
    alignSelf: 'center',
    backgroundColor: '#e9fbf2',
    borderWidth: 1,
    borderColor: '#19c37d',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  pendingWrap: { marginTop: 18 },
  savedPillText: { fontFamily: F700, fontSize: 12.5, color: '#16955f' },
  adviceKicker: { fontFamily: F700, fontSize: 12, color: '#6d5ef9', marginBottom: 3 },
  adviceText: { fontFamily: F500, fontSize: 12.5, lineHeight: 18, color: '#3b4657' },
  adviceBulb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  volRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 16,
  },
  volBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  volBtnText: { fontFamily: F800, fontSize: 20, lineHeight: 23, color: '#3b4657' },
  volBtnOff: { opacity: 0.3 },
  volValue: {
    fontFamily: F700,
    fontSize: 13,
    color: '#3b4657',
    minWidth: 82,
    textAlign: 'center',
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
    marginTop: 14,
  },
  controlCol: { alignItems: 'center', gap: 7, width: 90 },
  roundBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  roundBtnOff: { backgroundColor: '#fdeaea' },
  answerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#19c37d',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  controlLabel: {
    fontFamily: F600,
    fontSize: 10.5,
    color: '#8b93a7',
    textAlign: 'center',
  },

  safetyCard: {
    backgroundColor: '#e9f6ef',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 'auto',
  },
  safetyText: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#4a6b58',
    textAlign: 'center',
  },
});
