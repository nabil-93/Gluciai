import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendChatMessage } from '@/services/ai';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, spacing, typography } from '@/theme';
import type { ChatMessage } from '@/types';

export default function ChatScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { chatMessages, addChatMessage, profile } = useAppStore();
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<FlatList>(null);

  const suggestions = [
    t('chat.suggestion1'),
    t('chat.suggestion2'),
    t('chat.suggestion3'),
    t('chat.suggestion4'),
  ];

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    setInput('');

    const userMessage: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    };
    addChatMessage(userMessage);
    setThinking(true);

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
    } catch {
      addChatMessage({
        id: `${Date.now()}-e`,
        role: 'assistant',
        content: t('common.error'),
        created_at: new Date().toISOString(),
      });
    } finally {
      setThinking(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={18} color={colors.ai} />
        </View>
        <View>
          <Text style={styles.headerTitle}>{t('chat.title')}</Text>
          <Text style={styles.headerSub}>{t('chat.disclaimerShort')}</Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={chatMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.suggestion} onPress={() => send(s)}>
                <Ionicons name="sparkles-outline" size={14} color={colors.ai} />
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.aiBubble,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.role === 'user' && { color: '#08130D' },
              ]}
            >
              {item.content}
            </Text>
          </View>
        )}
        ListFooterComponent={
          thinking ? (
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[styles.bubbleText, { color: colors.textSecondary }]}>
                {t('chat.thinking')}
              </Text>
            </View>
          ) : null
        }
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.md) + 96 }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.textTertiary}
          multiline
          onSubmitEditing={() => send(input)}
        />
        <Pressable
          onPress={() => send(input)}
          style={[styles.sendButton, !input.trim() && { opacity: 0.4 }]}
        >
          <Ionicons name="arrow-up" size={20} color="#06101F" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.aiDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...typography.title },
  headerSub: { ...typography.caption, fontSize: 11, color: colors.textTertiary },
  messages: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  suggestions: { gap: spacing.md, marginTop: spacing.xl },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  suggestionText: { ...typography.body, fontSize: 14, flex: 1 },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { ...typography.body, fontSize: 15, lineHeight: 22 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  input: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    maxHeight: 120,
    color: colors.text,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
