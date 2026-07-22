import React, { useEffect, useRef, useState } from 'react';
import {
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
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import {
  getHealthyFood,
  healthyCategoryColors,
  healthyFoodName,
  type HealthyFood,
} from '@/data/healthyFoods';
import {
  buildCustomHealthyFood,
  registerCustomDish,
  type GeneratedDish,
} from '@/services/healthyCoach';
import { sendChatMessage, sendChatVoice } from '@/services/ai';
import { useAppStore } from '@/store/useAppStore';
import type { Profile } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3 11l18-8-8 18-2.5-7.5L3 11z" fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type Turn = { role: 'user' | 'assistant'; content: string };

/** Keep only valid [[food:id]] tokens (canonicalize bare ids, drop junk) so
 *  the model's dish suggestions always render as tappable cards. */
function normalizeFoodTokens(raw: string): string {
  return (raw ?? '')
    .replace(/^[ \t]*[-*•][ \t]+(\[\[[^\]]+\]\])[ \t]*$/gm, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, (_full, inner) => {
      const id = String(inner).trim().replace(/^food:/i, '').split('|')[0].trim();
      return getHealthyFood(id) ? `[[food:${id}]]` : '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pull a modified-dish spec the AI emits as `[[dish:{…json…}]]` (used on the
 * dish page so "add an egg / cut the calories" rebuilds the recipe). Returns
 * the parsed dish (if any) and the text with the token removed.
 */
function extractDishUpdate(text: string): { dish: GeneratedDish | null; clean: string } {
  const m = text.match(/\[\[dish:([\s\S]*?)\]\]/i);
  const clean = text.replace(/\[\[dish:[\s\S]*?\]\]/gi, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!m) return { dish: null, clean };
  try {
    const obj = JSON.parse(m[1].trim());
    if (obj && typeof obj === 'object' && typeof obj.name === 'string') {
      return { dish: obj as GeneratedDish, clean };
    }
  } catch {
    // malformed JSON → ignore the update, keep the prose
  }
  return { dish: null, clean };
}

/**
 * Shared full-screen AI chat, styled like the "Makla saine" coach: a large
 * slide-up sheet with a robot header, a scrollable thread and an input bar
 * that takes text OR voice (VoiceRecorderBar → sendChatVoice). Used by the
 * glycémie / glucides / insuline pages, the Makla-saine header coach and the
 * per-dish "Demander à l'IA" — one roomy, voice-capable, dish-aware window.
 *
 * It runs on the app's smart general chat (no rigid script), understands any
 * language/dialect, renders `[[food:id]]` suggestions as tappable dish cards,
 * and — when `onDishUpdate` is given — applies `[[dish:{…}]]` recipe edits the
 * model returns. A fresh conversation opens each time (seeded with `greeting`);
 * closing wipes the thread. sendChatMessage/sendChatVoice already ship the full
 * patient context (profile, glucose, insulin, meals, labs) to the model.
 */
export function CoachChatModal({
  open,
  onOpenChange,
  title,
  subtitle,
  greeting,
  placeholder,
  errorText,
  starters,
  contextPreamble,
  onDishUpdate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle: string;
  greeting: string;
  placeholder: string;
  errorText: string;
  /** Optional ready-to-tap prompts shown until the patient speaks. */
  starters?: string[];
  /** Hidden context prepended to every AI turn (e.g. the dish being viewed +
   *  a modify protocol). Never shown in the thread. */
  contextPreamble?: string;
  /** Called with the rebuilt dish when the AI returns a `[[dish:{…}]]` edit. */
  onDishUpdate?: (dish: HealthyFood) => void;
}) {
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile) as Profile | null;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Monotonic message-id source (kept off Date.now so nothing impure is
  // referenced while the component renders).
  const idc = useRef(0);
  const nextId = (p: string) => `${p}-${(idc.current += 1)}`;

  // Seed the greeting on open; wipe the thread on close (fresh chat each time).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMsgs([{ id: 'greet', role: 'assistant', content: greeting }]);
    } else {
      setMsgs([]);
      setInput('');
    }
  }

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [msgs.length, thinking]);

  // Real turns (drop the greeting), with the hidden context injected up front
  // as an acknowledged exchange so the model treats it as background, not a
  // question to answer.
  const buildTurns = (list: Msg[]): Turn[] => {
    const real = list
      .filter((m) => m.id !== 'greet')
      .map((m) => ({ role: m.role, content: m.content }));
    if (!contextPreamble) return real;
    return [
      { role: 'user', content: contextPreamble },
      { role: 'assistant', content: 'OK.' },
      ...real,
    ];
  };

  /** Fold an assistant reply into the thread: apply any dish edit, keep prose. */
  const pushAssistant = (reply: string) => {
    const { dish, clean } = onDishUpdate
      ? extractDishUpdate(reply)
      : { dish: null as GeneratedDish | null, clean: reply };
    if (dish && onDishUpdate) {
      // Unique, URL-safe id for the edited dish (names may hold spaces/accents/Arabic).
      const id = `custom-mod-${(idc.current += 1)}`;
      const food = buildCustomHealthyFood(dish, id);
      registerCustomDish(food);
      onDishUpdate(food);
    }
    setMsgs((s) => [...s, { id: nextId('a'), role: 'assistant', content: clean || reply }]);
  };

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    const userMsg: Msg = { id: nextId('u'), role: 'user', content };
    const turns = buildTurns([...msgs, userMsg]);
    setMsgs((s) => [...s, userMsg]);
    setThinking(true);
    try {
      const reply = await sendChatMessage(turns, i18n.language, profile, 'chat');
      pushAssistant(reply);
    } catch {
      setMsgs((s) => [...s, { id: nextId('e'), role: 'assistant', content: errorText }]);
    } finally {
      setThinking(false);
    }
  };

  const onAudio = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setThinking(true);
    try {
      const res = await sendChatVoice(buildTurns(msgs), i18n.language, profile, audio);
      if (res.transcript) {
        setMsgs((s) => [...s, { id: nextId('u'), role: 'user', content: `🎙️ ${res.transcript}` }]);
      }
      pushAssistant(res.reply || '');
    } catch {
      setMsgs((s) => [...s, { id: nextId('e'), role: 'assistant', content: errorText }]);
    } finally {
      setThinking(false);
    }
  };

  const openDish = (food: HealthyFood) => {
    onOpenChange(false);
    const custom = !getHealthyFood(food.id);
    setTimeout(() => {
      router.push({
        pathname: '/healthy-food',
        params: custom ? { custom: food.id } : { id: food.id },
      });
    }, 80);
  };

  // Render an assistant bubble: prose split by [[food:id]] dish cards.
  const renderAssistant = (content: string) => {
    const clean = normalizeFoodTokens(content);
    const parts = clean.split(/\[\[food:([a-z0-9-]+)\]\]/g);
    if (parts.length === 1) return <Text style={styles.aiText}>{clean}</Text>;
    return (
      <View style={{ gap: 8 }}>
        {parts.map((p, i) => {
          if (i % 2 === 1) {
            const food = getHealthyFood(p);
            if (!food) return null;
            const [c1] = healthyCategoryColors(food.category);
            return (
              <Pressable key={i} style={[styles.foodCard, { backgroundColor: c1 }]} onPress={() => openDish(food)}>
                <Text style={{ fontSize: 26 }}>{food.emoji}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.foodName} numberOfLines={1}>{healthyFoodName(food, i18n.language)}</Text>
                  <Text style={styles.foodStats}>🔥 {food.calories} kcal · 🍞 {food.carbs} g · IG {food.gi}</Text>
                </View>
                <Text style={styles.foodArrow}>›</Text>
              </Pressable>
            );
          }
          const txt = p.trim();
          return txt ? <Text key={i} style={styles.aiText}>{txt}</Text> : null;
        })}
      </View>
    );
  };

  const showStarters =
    !!starters?.length && !msgs.some((m) => m.role === 'user') && !thinking;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.robotWrap}>
              <AnimatedRobot size={36} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
              <Text style={styles.headSub} numberOfLines={1}>{subtitle}</Text>
            </View>
            <Pressable onPress={() => onOpenChange(false)} style={styles.closeBtn} hitSlop={8}>
              <Text style={{ fontSize: 16, color: '#5b6472' }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {msgs.map((m) =>
              m.role === 'user' ? (
                <View key={m.id} style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{m.content}</Text>
                  </View>
                </View>
              ) : (
                <View key={m.id} style={styles.aiRow}>
                  <View style={styles.aiAvatar}>
                    <AnimatedRobot size={24} mood="happy" />
                  </View>
                  <View style={styles.aiBubble}>{renderAssistant(m.content)}</View>
                </View>
              )
            )}

            {showStarters ? (
              <View style={styles.starterWrap}>
                {starters!.map((label, i) => (
                  <Pressable key={i} style={styles.starterChip} onPress={() => ask(label)}>
                    <Text style={styles.starterText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {thinking ? (
              <View style={styles.aiRow}>
                <View style={styles.aiAvatar}>
                  <AnimatedRobot size={24} mood="happy" />
                </View>
                <View style={styles.aiBubble}>
                  <Spinner size={18} color="#8b93a7" />
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <VoiceRecorderBar disabled={thinking} onAudio={onAudio}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={placeholder}
                placeholderTextColor="#98a1af"
                style={styles.input}
                multiline
                onSubmitEditing={() => ask(input)}
              />
              <Pressable
                onPress={() => ask(input)}
                style={[styles.sendBtn, (!input.trim() || thinking) && { opacity: 0.5 }]}
                disabled={!input.trim() || thinking}
              >
                <SendIcon />
              </Pressable>
            </VoiceRecorderBar>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', justifyContent: 'center', padding: 14 },
  sheet: {
    flex: 1,
    maxHeight: '86%',
    marginTop: 'auto',
    marginBottom: 'auto',
    backgroundColor: '#f9fafe',
    borderRadius: 26,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f5',
  },
  robotWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e9fbf2', alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontFamily: F800, fontSize: 14.5, color: '#111827' },
  headSub: { fontFamily: F500, fontSize: 11, color: '#8b93a7', marginTop: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f3f8', alignItems: 'center', justifyContent: 'center' },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: '#d8f5e5',
    borderRadius: 16,
    borderBottomRightRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  userText: { fontFamily: F600, fontSize: 13, lineHeight: 19, color: '#14532d' },

  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingRight: 24 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 13,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  aiText: { fontFamily: F500, fontSize: 13, lineHeight: 19, color: '#26313f' },

  // Tappable dish card rendered from a [[food:id]] token.
  foodCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 9 },
  foodName: { fontFamily: F700, fontSize: 12.5, color: '#111827' },
  foodStats: { fontFamily: F500, fontSize: 10.5, color: '#5b6472', marginTop: 2 },
  foodArrow: { fontFamily: F700, fontSize: 20, color: '#9aa3b2', paddingHorizontal: 2 },

  // Starter prompt chips (empty state)
  starterWrap: { gap: 8, paddingLeft: 36, paddingRight: 8 },
  starterChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7f0e2',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  starterText: { fontFamily: F600, fontSize: 12.5, color: '#0f7a45' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eef0f5',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#f4f6fa',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: F500,
    fontSize: 14,
    color: '#111827',
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#19c37d', alignItems: 'center', justifyContent: 'center' },
});
