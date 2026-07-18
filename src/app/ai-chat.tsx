import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, LockedScreen } from '@/components/ui';
import { LoggerConfirmCard } from '@/components/LoggerConfirmCard';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import {
  getHealthyFood,
  healthyCategoryColors,
  healthyFoodName,
} from '@/data/healthyFoods';
import { isRTL } from '@/i18n';
import { uniqueId } from '@/lib/clock';
import { confirmAsync } from '@/lib/confirm';
import { sendChatMessage, sendChatVoice } from '@/services/ai';
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

/** Chat bubble with a unique event-time id + timestamp. Module scope on
 *  purpose: ids are minted when the user/AI acts, never during render
 *  (React Compiler purity). */
const chatMsg = (
  suffix: string,
  role: ChatMessage['role'],
  content: string
): ChatMessage => ({
  id: uniqueId(suffix),
  role,
  content,
  created_at: new Date().toISOString(),
});

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

function PlusIcon({ color = '#19c37d' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
function ListIcon({ color = '#3b4657' }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h16M4 12h16M4 17h10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
function TrashIcon({ color = '#c0410b' }: { color?: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H7a1 1 0 01-1-1V7"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
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

/**
 * Assistant message body: renders plain text, and turns [[food:id]]
 * tokens (the AI's healthy-food recommendations) into tappable cards
 * that open the food's detail page (photo, nutrition, cooking steps).
 */
function AiMessageBody({
  content,
  lang,
  openLabel,
  onOpenFood,
}: {
  content: string;
  lang: string;
  openLabel: string;
  onOpenFood: (id: string) => void;
}) {
  const parts = content.split(/\[\[food:([a-z0-9-]+)(?:\|[^\]]*)?\]\]/g);
  if (parts.length === 1) {
    return <Text style={styles.aiText}>{content}</Text>;
  }
  return (
    <View style={{ gap: 8 }}>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          const food = getHealthyFood(p);
          if (!food) return null;
          const [c1] = healthyCategoryColors(food.category);
          return (
            <Pressable
              key={i}
              style={[styles.foodLink, { backgroundColor: c1 }]}
              onPress={() => onOpenFood(food.id)}
            >
              <Text style={{ fontSize: 26 }}>{food.emoji}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.foodLinkName} numberOfLines={1}>
                  {healthyFoodName(food, lang)}
                </Text>
                <Text style={styles.foodLinkStats}>
                  🔥 {food.calories} kcal · 🍞 {food.carbs} g · IG {food.gi}
                </Text>
              </View>
              <View style={styles.foodLinkBtn}>
                <Text style={styles.foodLinkBtnText}>{openLabel}</Text>
              </View>
            </Pressable>
          );
        }
        const txt = p.trim();
        if (!txt) return null;
        return (
          <Text key={i} style={styles.aiText}>
            {txt}
          </Text>
        );
      })}
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
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const profile = useAppStore((s) => s.profile);
  const addAiJournalEntry = useAppStore((s) => s.addAiJournalEntry);
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const newConversation = useAppStore((s) => s.newConversation);
  const selectConversation = useAppStore((s) => s.selectConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const messages =
    conversations.find((c) => c.id === activeConversationId)?.messages ?? [];

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [pendingAction, setPendingAction] = useState<LoggerAction | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  /* The logger sometimes needs ONE more detail before it can build the
   * entry (e.g. "which meal was it — lunch or dinner?"). While that
   * question is open, the patient's next message must go through
   * extraction again even when it doesn't look loggable by itself
   * ("f l3cha" alone would never match the keyword filter). */
  const loggerPendingRef = useRef(false);

  /** Last messages (user + assistant) as logger context, oldest first. */
  const loggerHistory = (extra: { role: 'user' | 'assistant'; content: string }[]) =>
    [...messages.map((m) => ({ role: m.role, content: m.content })), ...extra]
      .slice(-6)
      .map((m) => ({ ...m, content: m.content.replace(/^🎙️\s*/, '') }));

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const onNew = () => {
    newConversation();
    setPendingAction(null);
    loggerPendingRef.current = false;
    setInput('');
    setDrawerOpen(false);
  };

  const onDeleteConv = async (id: string) => {
    const ok = await confirmAsync({
      title: t('chat.deleteTitle'),
      message: t('chat.deleteBody'),
      confirmLabel: t('chat.delete'),
      cancelLabel: t('profile.cancel'),
      destructive: true,
    });
    if (ok) deleteConversation(id);
  };

  const scrollDown = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  useEffect(scrollDown, [messages.length, thinking, pendingAction, activeConversationId]);

  // Fresh conversation each new day: if the active thread's last message is
  // from a previous day, open a new one automatically. Old conversations
  // stay in the drawer — the patient can reopen any of them to continue it.
  useEffect(() => {
    const s = useAppStore.getState();
    const active = s.conversations.find((c) => c.id === s.activeConversationId);
    if (!active || active.messages.length === 0) return;
    const last = active.messages[active.messages.length - 1];
    if (
      new Date(last.created_at).toDateString() !== new Date().toDateString()
    ) {
      s.newConversation();
    }
    // Runs once when the chat opens.
  }, []);

  // Opened from the lab-analysis screen: the assistant opens the exchange —
  // "I've read your analysis, what would you like to ask?" (The lab values
  // themselves ride along in the health context of every chat request.)
  const labIntroRef = useRef(false);
  useEffect(() => {
    if (from !== 'lab' || labIntroRef.current) return;
    labIntroRef.current = true;
    addChatMessage(chatMsg('lab', 'assistant', t('labs.chatIntro')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    setPendingAction(null);

    const userMessage = chatMsg('u', 'user', content);
    addChatMessage(userMessage);
    setThinking(true);

    // "rani dert 6 unités", "klit tajine", "zid liya…" — when the message
    // states something loggable (or the logger is waiting for a missing
    // detail from the previous turn), extract it in parallel with the
    // normal answer and offer to save it (always behind an explicit
    // confirmation). The last few messages go along so answers like
    // "f l3cha" complete the entry started earlier.
    const shouldExtract = looksLoggable(content) || loggerPendingRef.current;
    const extraction = shouldExtract
      ? sendLoggerMessage(
          loggerHistory([{ role: 'user', content }]),
          i18n.language
        ).catch(() => null)
      : Promise.resolve(null);

    try {
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply = await sendChatMessage(history, i18n.language, profile);
      addChatMessage(chatMsg('a', 'assistant', reply));
      const extracted = await extraction;
      if (extracted?.action) {
        loggerPendingRef.current = false;
        setPendingAction(extracted.action);
      } else if (extracted && extracted.reply && looksLoggable(content)) {
        // The logger needs one more detail (e.g. which meal of the day):
        // surface its short question and keep extraction armed so the
        // patient's next answer finishes the entry.
        loggerPendingRef.current = true;
        addChatMessage(chatMsg('lq', 'assistant', extracted.reply));
      } else {
        loggerPendingRef.current = false;
      }
    } catch {
      addChatMessage(chatMsg('e', 'assistant', t('common.error')));
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

  // Voice message: Gemini listens to the audio (Darija included), shows the
  // transcript as the user's bubble and answers normally. Also offers to log
  // it when the patient described something loggable.
  const sendVoice = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setPendingAction(null);
    setThinking(true);
    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { reply, transcript } = await sendChatVoice(
        history,
        i18n.language,
        profile,
        audio
      );
      const heard = (transcript || '').trim();
      addChatMessage(
        chatMsg('uv', 'user', heard ? `🎙️ ${heard}` : `🎙️ ${t('logger.voiceNote')}`)
      );
      addChatMessage(chatMsg('a', 'assistant', reply));
      // If the spoken message was loggable (or the logger is waiting on a
      // missing detail), extract + offer the confirm card.
      if (heard && (looksLoggable(heard) || loggerPendingRef.current)) {
        sendLoggerMessage(
          loggerHistory([{ role: 'user', content: heard }]),
          i18n.language
        )
          .then((ex) => {
            if (ex?.action) {
              loggerPendingRef.current = false;
              setPendingAction(ex.action);
            } else if (ex?.reply && looksLoggable(heard)) {
              loggerPendingRef.current = true;
              addChatMessage(chatMsg('lq', 'assistant', ex.reply));
            } else {
              loggerPendingRef.current = false;
            }
          })
          .catch(() => {});
      }
    } catch {
      addChatMessage(chatMsg('e', 'assistant', t('common.error')));
    } finally {
      setThinking(false);
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
        <Pressable onPress={onNew} style={styles.hBtn} hitSlop={6}>
          <PlusIcon />
        </Pressable>
        <Pressable onPress={() => setDrawerOpen(true)} style={styles.hBtn} hitSlop={6}>
          <ListIcon />
        </Pressable>
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
            <Text style={styles.aiText}>
              {(() => {
                const firstName = profile?.name?.trim().split(/\s+/)[0];
                return firstName
                  ? t('chat.greetingNamed', { name: firstName })
                  : t('chat.greeting');
              })()}
            </Text>
          </View>
        </View>

        {messages.map((m) =>
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
                <AiMessageBody
                  content={m.content}
                  lang={i18n.language}
                  openLabel={t('hf.openCard')}
                  onOpenFood={(id) =>
                    router.push({ pathname: '/healthy-food', params: { id } })
                  }
                />
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

      {/* ── Input bar (mic → voice message; recording takes over the row) ── */}
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(insets.bottom, 10) + 4 },
        ]}
      >
        <VoiceRecorderBar
          disabled={thinking}
          onAudio={sendVoice}
          onDenied={() =>
            addChatMessage({
              id: `${Date.now()}-md`,
              role: 'assistant',
              content: t('logger.micDenied'),
              created_at: new Date().toISOString(),
            })
          }
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
        </VoiceRecorderBar>
      </View>

      {/* ── Conversations drawer ── */}
      <Modal
        visible={drawerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)}>
          <Pressable style={[styles.drawer, { paddingTop: insets.top + 14 }]} onPress={() => {}}>
            <Text style={styles.drawerTitle}>{t('chat.conversations')}</Text>

            <Pressable style={styles.newRow} onPress={onNew}>
              <View style={styles.newRowIcon}>
                <PlusIcon color="#ffffff" />
              </View>
              <Text style={styles.newRowText}>{t('chat.newConversation')}</Text>
            </Pressable>

            <ScrollView style={{ marginTop: 6 }} showsVerticalScrollIndicator={false}>
              {conversations.length === 0 ? (
                <Text style={styles.emptyConv}>{t('chat.noConversations')}</Text>
              ) : (
                conversations.map((c) => {
                  const active = c.id === activeConversationId;
                  return (
                    <View
                      key={c.id}
                      style={[styles.convRow, active && styles.convRowActive]}
                    >
                      <Pressable
                        style={{ flex: 1, minWidth: 0 }}
                        onPress={() => {
                          selectConversation(c.id);
                          setDrawerOpen(false);
                        }}
                      >
                        <Text style={styles.convTitle} numberOfLines={1}>
                          {c.title || t('chat.newConversation')}
                        </Text>
                        <Text style={styles.convTime}>
                          {new Date(c.updated_at).toLocaleDateString(i18n.language, {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDeleteConv(c.id)}
                        hitSlop={8}
                        style={styles.convDel}
                      >
                        <TrashIcon />
                      </Pressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  hBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },

  /* Conversations drawer */
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.42)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '82%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingBottom: 24,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  drawerTitle: {
    fontFamily: F800,
    fontSize: 18,
    color: '#101a2b',
    marginBottom: 14,
    marginTop: 2,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#eafaf1',
    borderRadius: 14,
  },
  newRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newRowText: { fontFamily: F700, fontSize: 14, color: '#0f7a45' },
  emptyConv: {
    fontFamily: F500,
    fontSize: 13,
    color: '#98a1af',
    textAlign: 'center',
    paddingVertical: 30,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 13,
    marginTop: 6,
  },
  convRowActive: { backgroundColor: '#f2f4f9' },
  convTitle: { fontFamily: F600, fontSize: 13.5, color: '#26313f' },
  convTime: { fontFamily: F500, fontSize: 11, color: '#a6aebc', marginTop: 2 },
  convDel: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdeee7',
  },

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

  /* Healthy-food recommendation card inside an AI bubble */
  foodLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  foodLinkName: { fontFamily: F700, fontSize: 12.5, color: '#111827' },
  foodLinkStats: { fontFamily: F600, fontSize: 10, color: '#5b6472', marginTop: 2 },
  foodLinkBtn: {
    backgroundColor: '#19c37d',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  foodLinkBtnText: { fontFamily: F800, fontSize: 10.5, color: '#ffffff' },

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
    alignItems: 'center',
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
