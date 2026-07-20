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
import { sendChatMessage, sendChatVoice } from '@/services/ai';
import { useAppStore } from '@/store/useAppStore';

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
 * Floating "healthy meal advisor" for the Makla saine screen. Same idea as
 * the Plats du monde robot: it knows the patient and recommends curated
 * diabetes-friendly dishes as tappable cards (the AI emits [[food:id]]
 * tokens, resolved here against the healthy-food catalog). Text or voice.
 */
export function HealthyAssistant() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [open, setOpen] = useState(false);
  const [hintShown, setHintShown] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHintShown(false);
      setMsgs([{ id: 'greet', role: 'assistant', content: t('healthyAI.greeting') }]);
    } else {
      setMsgs([]);
      setInput('');
    }
  }

  useEffect(() => {
    if (!hintShown) return;
    const id = setTimeout(() => setHintShown(false), 6000);
    return () => clearTimeout(id);
  }, [hintShown]);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(id);
  }, [msgs.length, thinking]);

  const history = (list: Msg[]) =>
    list.filter((m) => m.id !== 'greet').map((m) => ({ role: m.role, content: m.content }));

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content };
    const turns = history([...msgs, userMsg]);
    setMsgs((s) => [...s, userMsg]);
    setThinking(true);
    try {
      const reply = await sendChatMessage(turns, i18n.language, profile);
      setMsgs((s) => [...s, { id: `a-${Date.now()}`, role: 'assistant', content: reply }]);
    } catch {
      setMsgs((s) => [...s, { id: `e-${Date.now()}`, role: 'assistant', content: t('common.error') }]);
    } finally {
      setThinking(false);
    }
  };

  const onAudio = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setThinking(true);
    try {
      const { reply, transcript } = await sendChatVoice(history(msgs), i18n.language, profile, audio);
      setMsgs((s) => [
        ...s,
        ...(transcript ? [{ id: `u-${Date.now()}`, role: 'user' as const, content: `🎙️ ${transcript}` }] : []),
        { id: `a-${Date.now()}`, role: 'assistant' as const, content: reply },
      ]);
    } catch {
      setMsgs((s) => [...s, { id: `e-${Date.now()}`, role: 'assistant', content: t('common.error') }]);
    } finally {
      setThinking(false);
    }
  };

  const openFood = (id: string) => {
    setOpen(false);
    setTimeout(() => router.push({ pathname: '/healthy-food', params: { id } }), 80);
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
              <Pressable key={i} style={[styles.foodCard, { backgroundColor: c1 }]} onPress={() => openFood(food.id)}>
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

  return (
    <>
      {!open ? (
        <View style={[styles.floatWrap, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
          {hintShown ? (
            <Pressable onPress={() => setOpen(true)} style={styles.hintBubble}>
              <Text style={styles.hintText}>{t('healthyAI.hint')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setOpen(true)} style={styles.fab} accessibilityLabel={t('healthyAI.title')}>
            <AnimatedRobot size={40} mood="happy" />
          </Pressable>
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
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
              <Pressable onPress={() => setOpen(false)} style={styles.closeBtn} hitSlop={8}>
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
    </>
  );
}

const styles = StyleSheet.create({
  floatWrap: { position: 'absolute', right: 16, alignItems: 'flex-end', gap: 8 },
  hintBubble: {
    maxWidth: 220,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 13,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  hintText: { fontFamily: F600, fontSize: 12.5, lineHeight: 17, color: '#26313f' },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e9fbf2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#19c37d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 14,
    elevation: 8,
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

  aiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingRight: 30 },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 1,
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
