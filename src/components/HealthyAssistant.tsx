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
} from '@/data/healthyFoods';
import { collapseRepeats } from '@/lib/textSanitize';
import { healthyCoach, type CoachResult, type DishCard, type Recap } from '@/services/healthyCoach';
import { useAppStore } from '@/store/useAppStore';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Ready-to-tap starter prompts shown in the empty chat (i18n keys). */
const STARTERS = ['today', 'salad', 'dinner', 'dessert'] as const;

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
  /** Tappable follow-up chips (e.g. meal choices). */
  quickReplies?: string[];
  /** Confirmation card the patient reviews before generating dishes. */
  recap?: Recap;
  /** Generated dish cards (catalog + custom). */
  dishes?: DishCard[];
}

/** Keep only valid [[food:id]] tokens (canonicalize bare ids, drop junk). */
function normalizeFoodTokens(raw: string): string {
  return collapseRepeats(raw ?? '')
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
 * "Makla saine" meal coach. Opened from the robot button in the screen
 * header (controlled by the parent). It guides the patient — asks which
 * meal and what they want with ready-to-tap chips, shows a recap they can
 * confirm or edit, and on "Générer" proposes several dishes (ready catalog
 * ones + a fully custom dish built to order). Text or voice.
 */
export function HealthyAssistant({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  /** Id of the recap whose inline "modify" field is open (null = none). */
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [modifyText, setModifyText] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Seed the greeting on open; wipe the thread on close.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMsgs([{ id: 'greet', role: 'assistant', content: t('healthyAI.greeting') }]);
    } else {
      setMsgs([]);
      setInput('');
      setModifyId(null);
      setModifyText('');
    }
  }

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [msgs.length, thinking]);

  const history = (list: Msg[]) =>
    list.filter((m) => m.id !== 'greet').map((m) => ({ role: m.role, content: m.content }));

  const pushAssistant = (res: CoachResult) =>
    setMsgs((s) => [
      ...s,
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.reply || '',
        quickReplies: res.quickReplies.length ? res.quickReplies : undefined,
        recap: res.recap ?? undefined,
        dishes: res.dishes && res.dishes.length ? res.dishes : undefined,
      },
    ]);

  const pushError = () =>
    setMsgs((s) => [...s, { id: `e-${Date.now()}`, role: 'assistant', content: t('common.error') }]);

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content };
    const turns = history([...msgs, userMsg]);
    setMsgs((s) => [...s, userMsg]);
    setThinking(true);
    try {
      pushAssistant(await healthyCoach(turns, i18n.language, profile));
    } catch {
      pushError();
    } finally {
      setThinking(false);
    }
  };

  // "Générer" — asks the coach to produce the dish cards for the recap.
  // Pass the recap's meal so the proposals stay on that meal (breakfast
  // dishes for breakfast, etc.) instead of drifting to another moment.
  const generate = async () => {
    if (thinking) return;
    setModifyId(null);
    setThinking(true);
    const meal = [...msgs].reverse().find((m) => m.recap)?.recap?.meal;
    try {
      pushAssistant(
        await healthyCoach(history(msgs), i18n.language, profile, { generate: true, meal })
      );
    } catch {
      pushError();
    } finally {
      setThinking(false);
    }
  };

  const submitModify = () => {
    const text = modifyText.trim();
    if (!text) return;
    setModifyId(null);
    setModifyText('');
    ask(text);
  };

  const onAudio = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setThinking(true);
    try {
      const res = await healthyCoach(history(msgs), i18n.language, profile, { audio });
      setMsgs((s) => [
        ...s,
        ...(res.transcript
          ? [{ id: `u-${Date.now()}`, role: 'user' as const, content: `🎙️ ${res.transcript}` }]
          : []),
        {
          id: `a-${Date.now()}`,
          role: 'assistant' as const,
          content: res.reply || '',
          quickReplies: res.quickReplies.length ? res.quickReplies : undefined,
          recap: res.recap ?? undefined,
          dishes: res.dishes && res.dishes.length ? res.dishes : undefined,
        },
      ]);
    } catch {
      pushError();
    } finally {
      setThinking(false);
    }
  };

  const openDish = (card: DishCard) => {
    onOpenChange(false);
    setTimeout(() => {
      router.push(
        card.kind === 'catalog'
          ? { pathname: '/healthy-food', params: { id: card.id } }
          : { pathname: '/healthy-food', params: { custom: card.id } }
      );
    }, 80);
  };

  // A generated dish card (ready catalog dish or a custom one).
  const renderDishCard = (card: DishCard, key: React.Key) => {
    if (card.kind === 'catalog') {
      const food = getHealthyFood(card.id);
      if (!food) return null;
      const [c1] = healthyCategoryColors(food.category);
      return (
        <Pressable key={key} style={[styles.foodCard, { backgroundColor: c1 }]} onPress={() => openDish(card)}>
          <Text style={{ fontSize: 26 }}>{food.emoji}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.foodName} numberOfLines={1}>{healthyFoodName(food, i18n.language)}</Text>
            <Text style={styles.foodStats}>🔥 {food.calories} kcal · 🍞 {food.carbs} g · IG {food.gi}</Text>
          </View>
          <Text style={styles.foodArrow}>›</Text>
        </Pressable>
      );
    }
    const d = card.dish;
    const [c1] = healthyCategoryColors(d.category);
    return (
      <Pressable key={key} style={[styles.foodCard, { backgroundColor: c1 }]} onPress={() => openDish(card)}>
        <Text style={{ fontSize: 26 }}>{d.emoji || '🍽️'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.customNameRow}>
            <Text style={styles.foodName} numberOfLines={1}>{d.name}</Text>
            <View style={styles.iaBadge}>
              <Text style={styles.iaBadgeText}>{t('healthyAI.customBadge')}</Text>
            </View>
          </View>
          <Text style={styles.foodStats}>🔥 {d.calories} kcal · 🍞 {d.carbs} g · IG {d.gi}</Text>
        </View>
        <Text style={styles.foodArrow}>›</Text>
      </Pressable>
    );
  };

  // Proposals come in two clearly separated groups: first the dish the AI
  // created for THIS patient, then the ready dishes from our curated list.
  const renderDishGroups = (dishes: DishCard[]) => {
    const customs = dishes.filter((d) => d.kind === 'custom');
    const catalogs = dishes.filter((d) => d.kind === 'catalog');
    return (
      <View style={{ gap: 8 }}>
        {customs.length ? (
          <Text style={styles.dishSection}>✨ {t('healthyAI.aiSection')}</Text>
        ) : null}
        {customs.map((d, i) => renderDishCard(d, `c${i}`))}
        {catalogs.length ? (
          <Text style={[styles.dishSection, styles.dishSectionList]}>
            📗 {t('healthyAI.listSection')}
          </Text>
        ) : null}
        {catalogs.map((d, i) => renderDishCard(d, `k${i}`))}
      </View>
    );
  };

  // The confirm card: recap of the request + Générer / Modifier (or the
  // inline modify field). Actions only on the LAST message (the live recap).
  const renderRecap = (m: Msg, isLast: boolean) => {
    const recap = m.recap!;
    return (
      <View style={styles.recapCard}>
        <Text style={styles.recapTitle}>📋 {t('healthyAI.recapTitle')}</Text>
        <Text style={styles.recapSummary}>{recap.summary}</Text>
        {recap.wants.length ? (
          <View style={styles.recapChips}>
            {recap.wants.map((w, i) => (
              <View key={i} style={styles.recapChip}>
                <Text style={styles.recapChipText}>{w}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {!isLast ? null : modifyId === m.id ? (
          <View style={styles.modifyRow}>
            <TextInput
              value={modifyText}
              onChangeText={setModifyText}
              placeholder={t('healthyAI.modifyPlaceholder')}
              placeholderTextColor="#98a1af"
              style={styles.modifyInput}
              multiline
              autoFocus
              onSubmitEditing={submitModify}
            />
            <Pressable
              onPress={submitModify}
              style={[styles.modifySend, !modifyText.trim() && { opacity: 0.5 }]}
              disabled={!modifyText.trim()}
            >
              <SendIcon />
            </Pressable>
          </View>
        ) : (
          <View style={styles.recapBtns}>
            <Pressable
              style={[styles.genBtn, thinking && { opacity: 0.6 }]}
              onPress={generate}
              disabled={thinking}
            >
              <Text style={styles.genBtnText}>✨ {t('healthyAI.generate')}</Text>
            </Pressable>
            <Pressable
              style={styles.modBtn}
              onPress={() => {
                setModifyText('');
                setModifyId(m.id);
              }}
            >
              <Text style={styles.modBtnText}>✏️ {t('healthyAI.modify')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  // Render an assistant bubble: prose split by [[food:id]] cards.
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
              <Pressable key={i} style={[styles.foodCard, { backgroundColor: c1 }]} onPress={() => openDish({ kind: 'catalog', id: food.id })}>
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

  // Starter prompt chips: shown while the patient hasn't spoken yet.
  const showStarters = !msgs.some((m) => m.role === 'user') && !thinking;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.robotWrap}>
              <AnimatedRobot size={36} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>{t('healthyAI.title')}</Text>
              <Text style={styles.headSub}>{t('healthyAI.sub')}</Text>
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
            {msgs.map((m, idx) =>
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
                  <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                    {m.content ? <View style={styles.aiBubble}>{renderAssistant(m.content)}</View> : null}
                    {m.quickReplies?.length ? (
                      <View style={styles.quickWrap}>
                        {m.quickReplies.map((q, i) => (
                          <Pressable key={i} style={styles.quickChip} onPress={() => ask(q)}>
                            <Text style={styles.quickText}>{q}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {m.recap ? renderRecap(m, idx === msgs.length - 1) : null}
                    {m.dishes?.length ? renderDishGroups(m.dishes) : null}
                  </View>
                </View>
              )
            )}

            {showStarters ? (
              <View style={styles.starterWrap}>
                {STARTERS.map((key) => {
                  const label = t(`healthyAI.starters.${key}`);
                  return (
                    <Pressable key={key} style={styles.starterChip} onPress={() => ask(label)}>
                      <Text style={styles.starterText}>{label}</Text>
                    </Pressable>
                  );
                })}
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
                placeholder={t('healthyAI.placeholder')}
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

  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    padding: 9,
  },
  foodName: { fontFamily: F700, fontSize: 12.5, color: '#111827' },
  foodStats: { fontFamily: F500, fontSize: 10.5, color: '#5b6472', marginTop: 2 },
  foodArrow: { fontFamily: F700, fontSize: 20, color: '#9aa3b2', paddingHorizontal: 2 },
  customNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  iaBadge: { backgroundColor: 'rgba(17,24,39,0.14)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  iaBadgeText: { fontFamily: F800, fontSize: 8.5, color: '#111827', letterSpacing: 0.3 },
  // Group labels above the proposal cards (AI-created vs curated list).
  dishSection: { fontFamily: F800, fontSize: 11, color: '#7c6cf6', marginTop: 2, letterSpacing: 0.2 },
  dishSectionList: { color: '#0f7a45', marginTop: 6 },

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

  // Quick-reply chips under an AI bubble
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    backgroundColor: '#e9fbf2',
    borderWidth: 1,
    borderColor: '#bfead2',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  quickText: { fontFamily: F700, fontSize: 12, color: '#0f7a45' },

  // Recap / confirmation card
  recapCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#d7f0e2',
    padding: 13,
    gap: 8,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  recapTitle: { fontFamily: F800, fontSize: 12.5, color: '#0f7a45' },
  recapSummary: { fontFamily: F500, fontSize: 12.5, lineHeight: 18, color: '#26313f' },
  recapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recapChip: { backgroundColor: '#eef7f2', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  recapChipText: { fontFamily: F600, fontSize: 10.5, color: '#2b7a52' },
  recapBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  genBtn: {
    flex: 1,
    backgroundColor: '#19c37d',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genBtnText: { fontFamily: F800, fontSize: 12.5, color: '#ffffff' },
  modBtn: {
    backgroundColor: '#f1f6f3',
    borderWidth: 1,
    borderColor: '#d7e6dd',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modBtnText: { fontFamily: F700, fontSize: 12.5, color: '#3b6653' },
  modifyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  modifyInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 90,
    backgroundColor: '#f4f6fa',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: F500,
    fontSize: 13,
    color: '#111827',
  },
  modifySend: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#19c37d', alignItems: 'center', justifyContent: 'center' },

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
