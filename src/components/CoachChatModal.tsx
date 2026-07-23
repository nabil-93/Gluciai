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
  /** A dish edit the AI proposed on this turn, awaiting the patient's
   *  confirmation (only set on the dish page, when `onDishUpdate` is given). */
  pendingDish?: HealthyFood;
  /** The dish as it was BEFORE this proposal — for the before→after preview. */
  beforeDish?: HealthyFood | null;
  /** Set once the patient acts on the proposal. */
  editStatus?: 'applied' | 'cancelled';
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
  currentDish,
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
  /** Called with the rebuilt dish once the patient CONFIRMS a `[[dish:{…}]]`
   *  edit. Presence of this callback enables the propose→confirm gate. */
  onDishUpdate?: (dish: HealthyFood) => void;
  /** The dish currently shown on the page — used to preview before→after. */
  currentDish?: HealthyFood;
}) {
  const { t, i18n } = useTranslation();
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
  // Latest on-screen dish, read inside async callbacks to snapshot "before".
  const currentDishRef = useRef<HealthyFood | null>(currentDish ?? null);
  useEffect(() => {
    currentDishRef.current = currentDish ?? null;
  }, [currentDish]);

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

  /** Fold an assistant reply into the thread. A dish edit is NOT applied
   *  immediately — it becomes a proposal card the patient confirms first. */
  const pushAssistant = (reply: string) => {
    const { dish, clean } = onDishUpdate
      ? extractDishUpdate(reply)
      : { dish: null as GeneratedDish | null, clean: reply };
    if (dish && onDishUpdate) {
      // Unique, URL-safe id for the edited dish (names may hold spaces/accents/Arabic).
      const id = `custom-mod-${(idc.current += 1)}`;
      const food = buildCustomHealthyFood(dish, id);
      setMsgs((s) => [
        ...s,
        {
          id: nextId('a'),
          role: 'assistant',
          content: clean || reply,
          pendingDish: food,
          beforeDish: currentDishRef.current,
        },
      ]);
      return;
    }
    setMsgs((s) => [...s, { id: nextId('a'), role: 'assistant', content: clean || reply }]);
  };

  /** Patient confirmed a proposed edit → register + apply it live on the page. */
  const confirmEdit = (msg: Msg) => {
    if (!msg.pendingDish || !onDishUpdate) return;
    registerCustomDish(msg.pendingDish);
    onDishUpdate(msg.pendingDish);
    setMsgs((s) =>
      s.map((m) =>
        m.id === msg.id ? { ...m, editStatus: 'applied', pendingDish: undefined } : m
      )
    );
  };
  /** Patient declined the proposed edit → keep the current dish untouched. */
  const cancelEdit = (msgId: string) => {
    setMsgs((s) =>
      s.map((m) =>
        m.id === msgId ? { ...m, editStatus: 'cancelled', pendingDish: undefined } : m
      )
    );
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

  // The propose→confirm card for a dish edit: the recalculated nutrition with
  // a before→after delta, plus Confirm / Cancel. Nothing is applied until the
  // patient taps Confirm.
  const renderEditCard = (m: Msg) => {
    if (m.editStatus === 'applied') {
      return <Text style={styles.editApplied}>✅ {t('hf.editApplied')}</Text>;
    }
    if (m.editStatus === 'cancelled') {
      return <Text style={styles.editCancelled}>{t('hf.editCancelled')}</Text>;
    }
    if (!m.pendingDish) return null;
    const after = m.pendingDish;
    const before = m.beforeDish ?? null;
    const cells: { label: string; value: number; unit: string; prev: number | null }[] = [
      { label: t('hf.calories'), value: after.calories, unit: 'kcal', prev: before?.calories ?? null },
      { label: t('hf.carbs'), value: after.carbs, unit: 'g', prev: before?.carbs ?? null },
      { label: t('hf.protein'), value: after.protein, unit: 'g', prev: before?.protein ?? null },
      { label: 'IG', value: after.gi, unit: '', prev: before?.gi ?? null },
    ];
    return (
      <View style={styles.editCard}>
        <Text style={styles.editTitle}>✏️ {t('hf.editProposed')}</Text>
        <Text style={styles.editName} numberOfLines={2}>
          {after.emoji} {healthyFoodName(after, i18n.language)}
        </Text>
        <View style={styles.editGrid}>
          {cells.map((c, i) => {
            const delta = c.prev == null ? null : c.value - c.prev;
            return (
              <View key={i} style={styles.editCell}>
                <Text style={styles.editCellLabel}>{c.label}</Text>
                <Text style={styles.editCellValue}>
                  {c.value}
                  {c.unit ? ` ${c.unit}` : ''}
                </Text>
                {delta == null || delta === 0 ? (
                  <Text style={styles.editDeltaZero}>=</Text>
                ) : (
                  <Text style={[styles.editDelta, delta > 0 ? styles.editUp : styles.editDown]}>
                    {delta > 0 ? '+' : '−'}
                    {Math.abs(delta)}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.editActions}>
          <Pressable style={styles.editCancelBtn} onPress={() => cancelEdit(m.id)}>
            <Text style={styles.editCancelText}>{t('hf.editCancel')}</Text>
          </Pressable>
          <Pressable style={styles.editConfirmBtn} onPress={() => confirmEdit(m)}>
            <Text style={styles.editConfirmText}>✓ {t('hf.editConfirm')}</Text>
          </Pressable>
        </View>
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
                  <View style={styles.aiCol}>
                    <View style={styles.aiBubble}>{renderAssistant(m.content)}</View>
                    {renderEditCard(m)}
                  </View>
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
  robotWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  aiCol: { flex: 1, minWidth: 0, gap: 8 },
  aiAvatar: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
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

  // Propose→confirm card for a dish edit (before→after + actions).
  editCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#cdeedd',
    padding: 12,
    gap: 10,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  editTitle: { fontFamily: F800, fontSize: 11.5, color: '#0f7a45', letterSpacing: 0.2 },
  editName: { fontFamily: F700, fontSize: 13.5, color: '#111827', lineHeight: 19 },
  editGrid: { flexDirection: 'row', gap: 6 },
  editCell: {
    flex: 1,
    backgroundColor: '#f6faf8',
    borderRadius: 11,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 1,
  },
  editCellLabel: { fontFamily: F600, fontSize: 8.5, color: '#7c8a83', textAlign: 'center' },
  editCellValue: { fontFamily: F800, fontSize: 12, color: '#14312a', textAlign: 'center' },
  editDelta: { fontFamily: F700, fontSize: 9.5 },
  editUp: { color: '#d9822b' },
  editDown: { color: '#16a860' },
  editDeltaZero: { fontFamily: F700, fontSize: 9.5, color: '#b3bcb7' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 1 },
  editCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f3f8',
  },
  editCancelText: { fontFamily: F700, fontSize: 12.5, color: '#5b6472' },
  editConfirmBtn: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#19c37d',
  },
  editConfirmText: { fontFamily: F800, fontSize: 12.5, color: '#ffffff' },
  editApplied: { fontFamily: F700, fontSize: 11.5, color: '#0f7a45', paddingLeft: 2 },
  editCancelled: { fontFamily: F600, fontSize: 11.5, color: '#8b93a7', paddingLeft: 2 },

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
