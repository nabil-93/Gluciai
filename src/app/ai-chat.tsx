import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, LockedScreen } from '@/components/ui';
import { LoggerConfirmCard } from '@/components/LoggerConfirmCard';
import { isRTL } from '@/i18n';
import { sendChatMessage } from '@/services/ai';
import {
  actionSummary,
  applyLoggerAction,
  looksLoggable,
  sendLoggerMessage,
  type LoggerAction,
} from '@/services/aiLogger';
import { useAppStore } from '@/store/useAppStore';
import type { ChatMessage } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* Quick-topic chips under the conversation (from the design mockup) */
const CHIPS = [
  { key: 'chip1', icon: '🥗' },
  { key: 'chip2', icon: '📊' },
  { key: 'chip3', icon: '💊' },
  { key: 'chip4', icon: '💬' },
] as const;

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

/** Three bouncing dots shown while Gemini is thinking. */
function TypingDots() {
  const vals = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 140),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 4 }}>
      {vals.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            backgroundColor: '#9aa6b5',
            transform: [
              {
                translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

/* Blocked from the admin dashboard? Show the lock instead of the chat. */
export default function AiChatScreenGate() {
  const locked = useAppStore((s) => s.lockedFeatures.includes('ai_chat'));
  const { t } = useTranslation();
  if (locked) return <LockedScreen featureLabel={t('locked.featChat')} />;
  return <AiChatScreen />;
}

function AiChatScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const { chatMessages, addChatMessage, profile, addAiJournalEntry } = useAppStore();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<LoggerAction | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const scrollDown = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  useEffect(scrollDown, [chatMessages.length, thinking, pendingAction]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    setPendingAction(null);

    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    addChatMessage(userMessage);
    setThinking(true);

    // "rani dert 6 unités", "klit tajine"… — when the message states
    // something loggable, extract it in parallel with the normal answer
    // and offer to save it (always behind an explicit confirmation).
    const extraction = looksLoggable(content)
      ? sendLoggerMessage([{ role: 'user', content }], i18n.language).catch(
          () => null
        )
      : Promise.resolve(null);

    try {
      const history = [...chatMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply = await sendChatMessage(history, i18n.language, profile);
      addChatMessage({
        id: `${Date.now()}-a`,
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      });
      const extracted = await extraction;
      if (extracted?.action) setPendingAction(extracted.action);
    } catch {
      addChatMessage({
        id: `${Date.now()}-e`,
        role: 'assistant',
        content: t('common.error'),
        created_at: new Date().toISOString(),
      });
    } finally {
      setThinking(false);
    }
  };

  const confirmLog = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    try {
      await applyLoggerAction(action);
      setPendingAction(null);
      addChatMessage({
        id: `${Date.now()}-log`,
        role: 'assistant',
        content:
          action.type === 'reminder' ? t('logger.reminderSet') : t('logger.added'),
        created_at: new Date().toISOString(),
      });
      addAiJournalEntry({
        id: `log-${Date.now()}`,
        icon: action.type === 'reminder' ? '⏰' : '📝',
        title: t('logger.journalTitle'),
        body: actionSummary(action),
        tone: 'success',
        created_at: new Date().toISOString(),
      });
    } catch {
      addChatMessage({
        id: `${Date.now()}-loge`,
        role: 'assistant',
        content: t('logger.error'),
        created_at: new Date().toISOString(),
      });
    }
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });

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
          <Text style={styles.headerTitle}>{t('chat.headerTitle')}</Text>
          <Text style={styles.headerSub}>{t('chat.headerSub')}</Text>
        </View>
        <View style={styles.headerRobot}>
          <AnimatedRobot size={40} mood="happy" />
        </View>
      </View>

      {/* ── Conversation ── */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 14 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting bubble (always first, not stored) */}
        <View style={styles.aiRow}>
          <View style={styles.aiAvatar}>
            <AnimatedRobot size={30} mood="happy" />
          </View>
          <View style={styles.aiBubble}>
            <Text style={styles.aiText}>{t('chat.greeting')}</Text>
          </View>
        </View>

        {chatMessages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={styles.userRow}>
              <View style={styles.userBubble}>
                <Text style={styles.userText}>{m.content}</Text>
                <Text style={styles.userTime}>{fmtTime(m.created_at)}</Text>
              </View>
            </View>
          ) : (
            <View key={m.id} style={styles.aiRow}>
              <View style={styles.aiAvatar}>
                <AnimatedRobot size={30} mood="happy" />
              </View>
              <View style={styles.aiBubble}>
                <Text style={styles.aiText}>{m.content}</Text>
                <Text style={styles.aiTime}>{fmtTime(m.created_at)}</Text>
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
              <TypingDots />
            </View>
          </View>
        ) : null}

        {pendingAction ? (
          <LoggerConfirmCard
            action={pendingAction}
            onConfirm={confirmLog}
            onCancel={() => setPendingAction(null)}
          />
        ) : null}
      </ScrollView>

      {/* ── Quick topics ── */}
      <View style={styles.chipsWrap}>
        {CHIPS.map((c) => (
          <Pressable
            key={c.key}
            style={styles.chip}
            onPress={() => send(t(`chat.${c.key}Q`))}
          >
            <Text style={{ fontSize: 13 }}>{c.icon}</Text>
            <Text style={styles.chipText}>{t(`chat.${c.key}`)}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Input bar ── */}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(insets.bottom, 10) + 4 },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={t('chat.placeholder')}
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

  /* AI bubbles (left, with avatar) */
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
  aiTime: { fontFamily: F500, fontSize: 10, color: '#a6aebc', marginTop: 5 },

  /* User bubbles (right, green) */
  userRow: { alignItems: 'flex-end', marginBottom: 12, paddingLeft: 40 },
  userBubble: {
    backgroundColor: '#d8f5e5',
    borderRadius: 16,
    borderBottomRightRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userText: { fontFamily: F600, fontSize: 13.5, lineHeight: 19.5, color: '#14532d' },
  userTime: {
    fontFamily: F500,
    fontSize: 10,
    color: '#6fa88a',
    marginTop: 5,
    textAlign: 'right',
  },

  /* Quick topic chips */
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

  /* Input bar */
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
