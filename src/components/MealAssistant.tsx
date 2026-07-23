import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
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
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import { collapseRepeats } from '@/lib/textSanitize';
import { capturePhoto, pickPhoto } from '@/services/imageInput';
import {
  applyMealActions,
  applyProposal,
  sendMealEdit,
  type ChatTurn,
  type MealProposal,
} from '@/services/mealEdit';
import type { FoodItemResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

// Monotonic message-id counter (a plain, lint-clean alternative to Date.now).
let _seq = 0;
const nextSeq = () => (_seq += 1);

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M3 11l18-8-8 18-2.5-7.5L3 11z" fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
    </Svg>
  );
}
function CameraIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3b4657" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}
function GalleryIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3b4657" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Path d="M21 15l-5-5L5 21" />
    </Svg>
  );
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  /** A photo the patient sent (local uri, shown as a thumbnail). */
  image?: string;
  /** Green recap of the plate changes this turn applied. */
  note?: string;
  /** A food the AI suggests adding — rendered as a confirm card. */
  proposal?: MealProposal;
  /** Set once the proposal card is resolved. */
  resolved?: 'added' | 'skipped';
}

/**
 * Small robot button to place inline (e.g. next to the "Aliments détectés"
 * heading). Tapping it opens the meal assistant sheet.
 */
export function MealRobotButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={styles.inlineRobot} accessibilityLabel={t('mealAI.title')} hitSlop={8}>
      <AnimatedRobot size={30} mood="happy" />
    </Pressable>
  );
}

/**
 * Meal assistant sheet (controlled by the parent). The patient tells it what
 * to change ("zid atay", "7eyed lkhobz"), sends a photo of a forgotten food
 * (camera or gallery), or asks a question. Text edits apply immediately; a
 * photo/uncertain addition is shown as a confirm card and added only on ✓.
 * Nutrition is resolved from the app's databases; totals update live and
 * nothing is saved until the patient confirms the meal at the end.
 */
export function MealAssistant({
  items,
  onApply,
  carbs,
  open,
  onOpenChange,
}: {
  items: FoodItemResult[];
  onApply: (items: FoodItemResult[]) => void;
  carbs: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMsgs([{ id: 'greet', role: 'assistant', content: t('mealAI.greeting', { carbs: Math.round(carbs) }) }]);
    } else {
      setMsgs([]);
      setInput('');
    }
  }

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [msgs.length, thinking]);

  const historyFrom = (list: Msg[]): ChatTurn[] =>
    list
      .filter((m) => m.id !== 'greet' && m.content)
      .map((m) => ({ role: m.role, content: m.content as string }));

  const summarize = (a: { added: string[]; removed: string[]; changed: string[] }): string | undefined => {
    const parts: string[] = [];
    if (a.added.length) parts.push(t('mealAI.added', { list: a.added.join(', ') }));
    if (a.removed.length) parts.push(t('mealAI.removed', { list: a.removed.join(', ') }));
    if (a.changed.length) parts.push(t('mealAI.changed', { list: a.changed.join(', ') }));
    return parts.join(' · ') || undefined;
  };

  // Apply direct actions + append the assistant bubble (with an optional
  // confirm proposal underneath).
  const applyResult = async (res: {
    reply: string;
    actions: Parameters<typeof applyMealActions>[1];
    proposal: MealProposal | null;
  }) => {
    let note: string | undefined;
    if (res.actions.length) {
      const applied = await applyMealActions(itemsRef.current, res.actions);
      onApply(applied.items);
      note = summarize(applied);
    }
    setMsgs((s) => [
      ...s,
      {
        id: `a-${nextSeq()}`,
        role: 'assistant',
        content: collapseRepeats(res.reply) || t('mealAI.done'),
        note,
        proposal: res.proposal ?? undefined,
      },
    ]);
  };

  const fail = () =>
    setMsgs((s) => [...s, { id: `e-${nextSeq()}`, role: 'assistant', content: t('common.error') }]);

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    const userMsg: Msg = { id: `u-${nextSeq()}`, role: 'user', content };
    const history = historyFrom([...msgs, userMsg]);
    setMsgs((s) => [...s, userMsg]);
    setThinking(true);
    try {
      await applyResult(await sendMealEdit(itemsRef.current, history, i18n.language));
    } catch {
      fail();
    } finally {
      setThinking(false);
    }
  };

  const onAudio = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setThinking(true);
    try {
      const history = historyFrom(msgs);
      const res = await sendMealEdit(itemsRef.current, history, i18n.language, { audio });
      if (res.transcript) {
        setMsgs((s) => [...s, { id: `u-${nextSeq()}`, role: 'user', content: `🎙️ ${res.transcript}` }]);
      }
      await applyResult(res);
    } catch {
      fail();
    } finally {
      setThinking(false);
    }
  };

  // Camera / gallery → show the photo in the chat, ask the AI to identify it.
  const sendPhoto = async (source: 'camera' | 'gallery') => {
    if (thinking) return;
    const picked = source === 'camera' ? await capturePhoto() : await pickPhoto();
    if (!picked) return;
    const history = historyFrom(msgs);
    setMsgs((s) => [...s, { id: `img-${nextSeq()}`, role: 'user', image: picked.uri }]);
    setThinking(true);
    try {
      await applyResult(await sendMealEdit(itemsRef.current, history, i18n.language, { image: picked.base64 }));
    } catch {
      fail();
    } finally {
      setThinking(false);
    }
  };

  const confirmProposal = async (id: string, proposal: MealProposal) => {
    setMsgs((s) => s.map((m) => (m.id === id ? { ...m, resolved: 'added' } : m)));
    const applied = await applyProposal(itemsRef.current, proposal);
    onApply(applied.items);
    setMsgs((s) => [
      ...s,
      { id: `c-${nextSeq()}`, role: 'assistant', content: t('mealAI.addedConfirm', { name: proposal.name }) },
    ]);
  };
  const skipProposal = (id: string) =>
    setMsgs((s) => s.map((m) => (m.id === id ? { ...m, resolved: 'skipped' } : m)));

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => onOpenChange(false)}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.robotWrap}>
              <AnimatedRobot size={36} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>{t('mealAI.title')}</Text>
              <Text style={styles.headSub}>{t('mealAI.sub')}</Text>
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
                  {m.image ? (
                    <Image source={{ uri: m.image }} style={styles.chatImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{m.content}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <View key={m.id} style={{ gap: 6 }}>
                  <View style={styles.aiRow}>
                    <View style={styles.aiAvatar}>
                      <AnimatedRobot size={24} mood="happy" />
                    </View>
                    <View style={styles.aiBubble}>
                      <Text style={styles.aiText}>{m.content}</Text>
                    </View>
                  </View>
                  {m.note ? (
                    <View style={styles.changeChip}>
                      <Text style={styles.changeText}>✓ {m.note}</Text>
                    </View>
                  ) : null}
                  {m.proposal && !m.resolved ? (
                    <View style={styles.proposalCard}>
                      <Text style={styles.proposalText}>
                        🍽️ {m.proposal.name} · {Math.round(m.proposal.grams)} g
                      </Text>
                      <View style={styles.proposalActions}>
                        <Pressable onPress={() => confirmProposal(m.id, m.proposal!)} style={styles.propYes}>
                          <Text style={styles.propYesText}>✓ {t('mealAI.propYes')}</Text>
                        </Pressable>
                        <Pressable onPress={() => skipProposal(m.id)} style={styles.propNo}>
                          <Text style={styles.propNoText}>✕</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  {m.resolved === 'added' ? (
                    <Text style={styles.resolvedText}>✓ {t('mealAI.propAdded')}</Text>
                  ) : null}
                </View>
              )
            )}
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
              <Pressable onPress={() => sendPhoto('camera')} style={styles.mediaBtn} disabled={thinking} accessibilityLabel={t('mealAI.camera')}>
                <CameraIcon />
              </Pressable>
              <Pressable onPress={() => sendPhoto('gallery')} style={styles.mediaBtn} disabled={thinking} accessibilityLabel={t('mealAI.gallery')}>
                <GalleryIcon />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('mealAI.placeholder')}
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
  inlineRobot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

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
  chatImage: { width: 150, height: 150, borderRadius: 16, borderBottomRightRadius: 5, backgroundColor: '#e6e9f0' },

  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 30 },
  aiAvatar: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBubble: {
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
  changeChip: {
    alignSelf: 'flex-start',
    marginLeft: 36,
    backgroundColor: '#e9fbf2',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  changeText: { fontFamily: F700, fontSize: 11.5, lineHeight: 16, color: '#0f7a45' },

  proposalCard: {
    marginLeft: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e7e2ff',
    padding: 10,
  },
  proposalText: { flex: 1, fontFamily: F700, fontSize: 12.5, color: '#111827' },
  proposalActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  propYes: { backgroundColor: '#6d5ef9', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  propYesText: { fontFamily: F800, fontSize: 12, color: '#ffffff' },
  propNo: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f1f3f8', alignItems: 'center', justifyContent: 'center' },
  propNoText: { fontFamily: F700, fontSize: 14, color: '#8b93a7' },
  resolvedText: { marginLeft: 36, fontFamily: F700, fontSize: 11.5, color: '#0f7a45' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#eef0f5',
  },
  mediaBtn: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: '#f4f6fa',
    borderRadius: 22,
    paddingHorizontal: 14,
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
    backgroundColor: '#6d5ef9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
