import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, LockedScreen } from '@/components/ui';
import { LoggerConfirmCard } from '@/components/LoggerConfirmCard';
import { isRTL } from '@/i18n';
import {
  VOICE_NOTE_MAX_MS,
  VoiceNoteRecorder,
  applyLoggerAction,
  sendLoggerMessage,
  type LoggerAction,
} from '@/services/aiLogger';
import { useAppStore } from '@/store/useAppStore';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M3 11l18-8-8 18-2.5-7.5L3 11z"
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MicIcon({ active }: { active: boolean }) {
  const color = active ? '#ffffff' : '#3b4657';
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const CHIP_KEYS = ['chipInsulin', 'chipMeal', 'chipGlucose', 'chipSport'] as const;
const CHIP_ICONS = ['💉', '🍽️', '🩸', '🏃'] as const;

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/* Locked with the same switch as the chat (it's an AI text feature). */
export default function AiLogScreenGate() {
  const locked = useAppStore((s) => s.lockedFeatures.includes('ai_chat'));
  const { t } = useTranslation();
  if (locked) return <LockedScreen featureLabel={t('locked.featChat')} />;
  return <AiLogScreen />;
}

/**
 * "Dites-le, je l'enregistre": the patient tells the robot what they did
 * (typed or dictated); the AI structures it, the patient CONFIRMS, and the
 * entry is saved exactly like a manual one (history, day report, AI
 * context, doctor dashboard).
 */
function AiLogScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const addAiJournalEntry = useAppStore((s) => s.addAiJournalEntry);

  const [thread, setThread] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<LoggerAction | null>(null);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const recRef = useRef<VoiceNoteRecorder | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollDown = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };
  useEffect(scrollDown, [thread.length, thinking, pendingAction]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const pushBubble = (role: Bubble['role'], content: string) =>
    setThread((s) => [...s, { id: `${Date.now()}-${s.length}`, role, content }]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    setPendingAction(null);
    const next: Bubble[] = [
      ...thread,
      { id: `${Date.now()}-u`, role: 'user', content },
    ];
    setThread(next);
    setThinking(true);
    try {
      const turn = await sendLoggerMessage(
        next.map((b) => ({ role: b.role, content: b.content })),
        i18n.language
      );
      if (turn.reply) pushBubble('assistant', turn.reply);
      if (turn.action) setPendingAction(turn.action);
    } catch {
      pushBubble('assistant', t('logger.error'));
    } finally {
      setThinking(false);
    }
  };

  const confirm = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    try {
      await applyLoggerAction(action);
      setPendingAction(null);
      pushBubble('assistant', t('logger.added'));
      // Trace in the AI coach journal so the robot's log shows it too.
      addAiJournalEntry({
        id: `log-${Date.now()}`,
        icon: '📝',
        title: t('logger.journalTitle'),
        body:
          action.type === 'insulin'
            ? `💉 ${action.dose} U ${t(`day.insu_${action.insulin_type}` as any)}`
            : action.type === 'glucose'
              ? `🩸 ${action.value} mg/dL`
              : action.type === 'meal'
                ? `🍽️ ${action.name} (≈${action.calories} kcal, ${action.carbs} g)`
                : action.type === 'activity'
                  ? `🏃 ${action.kind} ${action.duration_min} min`
                  : `📏 ${action.value} ${action.unit}`,
        tone: 'success',
        created_at: new Date().toISOString(),
      });
    } catch {
      pushBubble('assistant', t('logger.error'));
    }
  };

  const cancel = () => {
    setPendingAction(null);
    pushBubble('assistant', t('logger.canceled'));
  };

  /* ── Voice notes: record real audio and let GEMINI listen to it —
     it understands Darija and mixed dialects exactly like typed text
     (browser speech-to-text does not, so we never use it). ── */
  const canRecord =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia;

  const sendVoiceNote = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setPendingAction(null);
    setThinking(true);
    try {
      const turn = await sendLoggerMessage(
        thread.map((b) => ({ role: b.role, content: b.content })),
        i18n.language,
        audio
      );
      // Show what the AI HEARD as the user's bubble — instant feedback
      // that the voice note was understood correctly.
      const heard = (turn.transcript ?? '').trim();
      setThread((s) => [
        ...s,
        {
          id: `${Date.now()}-v`,
          role: 'user',
          content: heard ? `🎙️ ${heard}` : t('logger.voiceNote'),
        },
        ...(turn.reply
          ? [{ id: `${Date.now()}-a`, role: 'assistant' as const, content: turn.reply }]
          : []),
      ]);
      if (turn.action) setPendingAction(turn.action);
    } catch {
      pushBubble('assistant', t('logger.error'));
    } finally {
      setThinking(false);
    }
  };

  const stopRecording = (send: boolean) => {
    if (recTimerRef.current) {
      clearTimeout(recTimerRef.current);
      recTimerRef.current = null;
    }
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    if (!rec) return;
    if (!send) {
      rec.cancel();
      return;
    }
    const audio = rec.stop();
    if (audio) void sendVoiceNote(audio);
  };

  const toggleMic = async () => {
    if (listening) {
      stopRecording(true);
      return;
    }
    if (thinking) return;
    try {
      const rec = new VoiceNoteRecorder();
      await rec.start(); // must happen inside the tap (iOS)
      recRef.current = rec;
      setListening(true);
      recTimerRef.current = setTimeout(() => stopRecording(true), VOICE_NOTE_MAX_MS);
    } catch {
      recRef.current = null;
      setListening(false);
      pushBubble('assistant', t('logger.micDenied'));
    }
  };

  useEffect(
    () => () => {
      if (recTimerRef.current) clearTimeout(recTimerRef.current);
      recRef.current?.cancel();
    },
    []
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={close} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('logger.title')}</Text>
          <Text style={styles.headerSub}>{t('logger.sub')}</Text>
        </View>
        <View style={styles.headerRobot}>
          <AnimatedRobot size={40} mood="happy" />
        </View>
      </View>

      {/* ── Thread ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 14 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}>
            <AnimatedRobot size={30} mood="happy" />
          </View>
          <View style={styles.aiBubble}>
            <Text style={styles.aiText}>{t('logger.intro')}</Text>
          </View>
        </View>

        {thread.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.aiRow}>
              <View style={styles.aiAvatar}>
                <AnimatedRobot size={30} mood="happy" />
              </View>
              <View style={styles.aiBubble}>
                <Text style={styles.aiText}>{m.content}</Text>
              </View>
            </View>
          )
        )}

        {thinking ? (
          <View style={styles.aiRow}>
            <View style={styles.aiAvatar}>
              <AnimatedRobot size={30} mood="happy" />
            </View>
            <View style={styles.aiBubble}>
              <Text style={styles.aiText}>…</Text>
            </View>
          </View>
        ) : null}

        {pendingAction ? (
          <LoggerConfirmCard
            action={pendingAction}
            onConfirm={confirm}
            onCancel={cancel}
          />
        ) : null}
      </ScrollView>

      {/* ── Example chips ── */}
      {thread.length === 0 ? (
        <View style={styles.chipsWrap}>
          {CHIP_KEYS.map((k, i) => (
            <Pressable key={k} style={styles.chip} onPress={() => send(t(`logger.${k}`))}>
              <Text style={{ fontSize: 13 }}>{CHIP_ICONS[i]}</Text>
              <Text style={styles.chipText}>{t(`logger.${k}`)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Input bar ── */}
      <View
        style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}
      >
        {canRecord ? (
          <Pressable
            onPress={toggleMic}
            style={[styles.micBtn, listening && styles.micBtnOn]}
          >
            <MicIcon active={listening} />
          </Pressable>
        ) : null}
        <TextInput
          value={input}
          onChangeText={setInput}
          editable={!listening}
          placeholder={listening ? t('logger.recording') : t('logger.placeholder')}
          placeholderTextColor="#98a1af"
          style={styles.input}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <Pressable
          onPress={() => send(input)}
          style={[styles.sendBtn, (!input.trim() || thinking) && { opacity: 0.5 }]}
          disabled={!input.trim() || thinking}
        >
          <SendIcon />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f5',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: F800, fontSize: 16.5, color: '#111827' },
  headerSub: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 1 },
  headerRobot: { width: 40, alignItems: 'center' },

  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
    paddingRight: 40,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  aiBubble: {
    flexShrink: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  aiText: { fontFamily: F500, fontSize: 13.5, lineHeight: 19.5, color: '#26313f' },

  userRow: { alignItems: 'flex-end', marginBottom: 12, paddingLeft: 40 },
  userBubble: {
    backgroundColor: '#d8f5e5',
    borderRadius: 16,
    borderBottomRightRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userText: { fontFamily: F600, fontSize: 13.5, lineHeight: 19.5, color: '#14532d' },

  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6e9f0',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipText: { fontFamily: F600, fontSize: 12, color: '#3b4657' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eef0f5',
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnOn: { backgroundColor: '#ef4444' },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: '#f4f6fa',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: F500,
    fontSize: 14,
    color: '#111827',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#19c37d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
});
