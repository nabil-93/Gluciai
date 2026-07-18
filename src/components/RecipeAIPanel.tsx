import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot } from '@/components/ui';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import { sendLoggerMessage } from '@/services/aiLogger';
import {
  recipeImage,
  suggestDishes,
  type DishSuggestion,
} from '@/services/worldRecipes';

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
  dishes?: DishSuggestion[];
}

/**
 * Floating AI meal advisor. Opens over the recipes screen; the assistant
 * already knows the patient (glucose, insulin, allergies…), asks about
 * dislikes/allergies, then recommends dishes as tappable cards. Text or
 * voice input. Tapping a dish opens its full recipe.
 */
export function RecipeAIPanel({
  visible,
  onClose,
  onPickDish,
  country,
  moment,
}: {
  visible: boolean;
  onClose: () => void;
  onPickDish: (dish: DishSuggestion) => void;
  country?: string;
  moment?: string;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Open/close transitions adjusted during render (the official React
  // "previous renders" pattern — no setState-in-effect cascade):
  // opening seeds the greeting, closing clears the conversation.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setMsgs([{ id: 'greet', role: 'assistant', content: t('wr.aiGreeting') }]);
    } else {
      setMsgs([]);
      setInput('');
    }
  }

  useEffect(() => {
    const id = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      80
    );
    return () => clearTimeout(id);
  }, [msgs.length, thinking]);

  const ask = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content };
    const history = [...msgs, userMsg]
      .filter((m) => m.id !== 'greet')
      .map((m) => ({ role: m.role, content: m.content }));
    setMsgs((s) => [...s, userMsg]);
    setThinking(true);
    try {
      const res = await suggestDishes(
        { country, moment: moment as any, messages: history },
        i18n.language
      );
      if (res) {
        setMsgs((s) => [
          ...s,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.ready ? res.reply : res.question || res.reply,
            dishes: res.ready ? res.dishes : undefined,
          },
        ]);
      } else {
        setMsgs((s) => [
          ...s,
          { id: `e-${Date.now()}`, role: 'assistant', content: t('common.error') },
        ]);
      }
    } finally {
      setThinking(false);
    }
  };

  // Voice: transcribe the WAV (Gemini hears Darija), then treat as text.
  const onAudio = async (audio: { mimeType: string; data: string }) => {
    if (thinking) return;
    setThinking(true);
    try {
      const { transcript } = await sendLoggerMessage([], i18n.language, audio);
      const heard = (transcript || '').trim();
      setThinking(false);
      if (heard) await ask(heard);
    } catch {
      setThinking(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          {/* ── Header ── */}
          <View style={styles.head}>
            <View style={styles.robotWrap}>
              <AnimatedRobot size={36} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headTitle}>{t('wr.aiTitle')}</Text>
              <Text style={styles.headSub}>{t('wr.aiSub')}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={{ fontSize: 16, color: '#5b6472' }}>✕</Text>
            </Pressable>
          </View>

          {/* ── Conversation ── */}
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {msgs.map((m) =>
              m.role === 'user' ? (
                <View key={m.id} style={styles.userRow}>
                  <View style={styles.userBubble}>
                    <Text style={styles.userText}>{m.content}</Text>
                  </View>
                </View>
              ) : (
                <View key={m.id} style={{ gap: 8 }}>
                  <View style={styles.aiRow}>
                    <View style={styles.aiAvatar}>
                      <AnimatedRobot size={24} mood="happy" />
                    </View>
                    <View style={styles.aiBubble}>
                      <Text style={styles.aiText}>{m.content}</Text>
                    </View>
                  </View>
                  {m.dishes?.length ? (
                    <View style={styles.dishGrid}>
                      {m.dishes.map((d, i) => (
                        <Pressable
                          key={i}
                          style={styles.dishCard}
                          onPress={() => onPickDish(d)}
                        >
                          <View style={styles.dishThumb}>
                            {d.image ? (
                              <Image
                                source={{ uri: recipeImage(d.image, 'small') }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            ) : (
                              <Text style={{ fontSize: 26 }}>🍽️</Text>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.dishNameRow}>
                              <Text style={styles.dishName} numberOfLines={2}>
                                {d.name}
                              </Text>
                              <Text style={d.ready ? styles.tagReady : styles.tagAi}>
                                {d.ready ? '✓' : '✨'}
                              </Text>
                            </View>
                            {d.note ? (
                              <Text style={styles.dishNote} numberOfLines={2}>
                                {d.note}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.dishArrow}>›</Text>
                        </Pressable>
                      ))}
                    </View>
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
                  <ActivityIndicator color="#8b93a7" size="small" />
                </View>
              </View>
            ) : null}
          </ScrollView>

          {/* ── Input (text + voice) ── */}
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <VoiceRecorderBar disabled={thinking} onAudio={onAudio}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('wr.aiPlaceholder')}
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.5)',
    justifyContent: 'center',
    padding: 14,
  },
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
  robotWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { fontFamily: F800, fontSize: 14.5, color: '#111827' },
  headSub: { fontFamily: F500, fontSize: 11, color: '#8b93a7', marginTop: 1 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },

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

  dishGrid: { gap: 8, paddingLeft: 36 },
  dishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 8,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  dishThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f2f4f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dishNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dishName: { flex: 1, fontFamily: F700, fontSize: 12.5, color: '#111827', lineHeight: 16 },
  tagReady: { fontSize: 11, color: '#19c37d' },
  tagAi: { fontSize: 11, color: '#6d5ef9' },
  dishNote: { fontFamily: F500, fontSize: 10.5, color: '#8b93a7', marginTop: 2 },
  dishArrow: { fontFamily: F700, fontSize: 20, color: '#c4cad6', paddingHorizontal: 4 },

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
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6d5ef9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
