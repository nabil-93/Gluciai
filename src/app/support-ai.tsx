import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

import { AnimatedRobot } from '@/components/ui';
import { Spinner } from '@/components/ui/Spinner';
import { VoiceRecorderBar } from '@/components/VoiceRecorderBar';
import { hasWhatsappSupport, whatsappUrl } from '@/config/support';
import { askAppHelp, type HelpAudio, type HelpTurn } from '@/services/appHelp';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN_D = '#0F7A42';
const WA = '#1DA851';
const INK = '#1e2a23';
const MUTED = '#67736B';

interface Bubble {
  role: 'user' | 'assistant';
  text: string;
  /** Assistant admitted it couldn't settle this → offer the human channel. */
  escalate?: boolean;
  /** This turn came in as a voice note (shows a mic glyph on the bubble). */
  voice?: boolean;
}

/**
 * The in-app help assistant. It answers "how do I…" questions about GlucoAI
 * itself (a different job from the health chat, which is about the patient's
 * diabetes), and when it cannot settle something it says so and hands over to
 * human support instead of looping.
 */
export default function SupportAiScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { role: 'assistant', text: t('support.intro') },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([
    t('support.s1'),
    t('support.s2'),
    t('support.s3'),
  ]);

  const scrollDown = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  /**
   * One turn, by text OR by voice note. With audio the user bubble is a
   * placeholder until the assistant answers, then it is replaced by what was
   * actually heard — so a mis-heard question is visible instead of producing a
   * baffling answer.
   */
  const send = async (text: string, audio?: HelpAudio) => {
    const q = text.trim();
    if ((!q && !audio) || busy) return;
    setInput('');
    setError(false);
    setSuggestions([]);
    const shown = q || t('support.voiceNote');
    const next: Bubble[] = [...bubbles, { role: 'user', text: shown, voice: !!audio }];
    setBubbles(next);
    setBusy(true);
    scrollDown();
    try {
      // The voice turn carries no text yet — send only the prior history.
      const history: HelpTurn[] = (audio ? bubbles : next).map((b) => ({
        role: b.role,
        content: b.text,
      }));
      const res = await askAppHelp(history, i18n.language, audio);
      setBubbles((b) => {
        const copy = [...b];
        if (audio && res.transcript) {
          const lastUser = copy.map((x) => x.role).lastIndexOf('user');
          if (lastUser >= 0) copy[lastUser] = { ...copy[lastUser], text: res.transcript };
        }
        return [...copy, { role: 'assistant', text: res.reply, escalate: res.needsSupport }];
      });
      setSuggestions(res.quickReplies);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  const openWhatsapp = () => {
    void Linking.openURL(whatsappUrl());
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#3e4c44', '#2c3730', '#242e28']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.navRow}>
          <Pressable
            style={styles.navBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/support' as never))}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m15 18-6-6 6-6" />
            </Svg>
          </Pressable>
          <View style={styles.headTitleRow}>
            <AnimatedRobot size={26} mood="happy" />
            <Text style={styles.navTitle}>{t('support.chatTitle')}</Text>
          </View>
          <View style={styles.navBtn} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.feed}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {bubbles.map((b, i) =>
            b.role === 'user' ? (
              <View key={i} style={styles.userRow}>
                <View style={[styles.userBubble, b.voice && styles.userBubbleVoice]}>
                  {b.voice ? (
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <Path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                    </Svg>
                  ) : null}
                  <Text style={styles.userText}>{b.text}</Text>
                </View>
              </View>
            ) : (
              <View key={i} style={styles.botRow}>
                <View style={styles.botAvatar}>
                  <AnimatedRobot size={28} mood="happy" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                  <View style={styles.botBubble}>
                    <Text style={styles.botText}>{b.text}</Text>
                  </View>
                  {/* The assistant gave up → hand over to a human, right here */}
                  {b.escalate && hasWhatsappSupport() ? (
                    <View style={styles.escalate}>
                      <Text style={styles.escalateTitle}>{t('support.failTitle')}</Text>
                      <Text style={styles.escalateBody}>{t('support.failBody')}</Text>
                      <Pressable style={styles.escalateCta} onPress={openWhatsapp} accessibilityRole="button">
                        <Text style={styles.escalateCtaText}>{t('support.waCta')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            )
          )}

          {busy ? (
            <View style={styles.botRow}>
              <View style={styles.botAvatar}>
                <AnimatedRobot size={28} mood="happy" />
              </View>
              <View style={[styles.botBubble, styles.thinking]}>
                <Spinner size={14} color={GREEN_D} />
                <Text style={styles.thinkingText}>{t('support.thinking')}</Text>
              </View>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{t('support.error')}</Text>
              {hasWhatsappSupport() ? (
                <Pressable style={styles.escalateCta} onPress={openWhatsapp} accessibilityRole="button">
                  <Text style={styles.escalateCtaText}>{t('support.waCta')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {suggestions.length > 0 && !busy ? (
            <View style={styles.suggests}>
              {suggestions.map((s, i) => (
                <Pressable key={i} style={styles.suggest} onPress={() => void send(s)}>
                  <Text style={styles.suggestText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* Text or voice — same bar the health chat uses, so recording feels
            identical everywhere in the app. */}
        <View style={[styles.composer, { paddingBottom: 10 + insets.bottom }]}>
          {/* VoiceRecorderBar renders a FRAGMENT (mic button + children as
              siblings), so this View has to be the flex row itself. */}
          <VoiceRecorderBar
            disabled={busy}
            onAudio={(a) => void send('', a)}
            onDenied={() => setError(true)}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={t('support.placeholder')}
              placeholderTextColor="#93a09a"
              style={styles.input}
              multiline
              onSubmitEditing={() => void send(input)}
              editable={!busy}
            />
            <Pressable
              style={[styles.sendBtn, (!input.trim() || busy) && styles.sendOff]}
              onPress={() => void send(input)}
              disabled={!input.trim() || busy}
              accessibilityRole="button"
            >
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <Path d="m22 2-7 20-4-9-9-4z" />
              </Svg>
            </Pressable>
          </VoiceRecorderBar>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef1ec' },

  header: { paddingBottom: 12 },
  navRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  navTitle: { color: '#fff', fontSize: 16, fontFamily: F700 },

  feed: { padding: 14, gap: 12 },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '86%',
    backgroundColor: GREEN_D,
    borderRadius: 16,
    borderBottomRightRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userBubbleVoice: { paddingRight: 15 },
  // White on #0F7A42 is 5.4:1.
  userText: { color: '#fff', fontSize: 12.5, lineHeight: 18, fontFamily: F500 },

  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  botAvatar: { width: 32, alignItems: 'center', paddingTop: 2 },
  botBubble: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderTopLeftRadius: 6,
    paddingVertical: 11,
    paddingHorizontal: 13,
    shadowColor: 'rgba(28,39,33,1)',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  botText: { color: INK, fontSize: 12.5, lineHeight: 18.5, fontFamily: F500 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { color: MUTED, fontSize: 12, fontFamily: F600 },

  escalate: {
    backgroundColor: '#FFFBF3',
    borderWidth: 1,
    borderColor: '#F4E3C6',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  escalateTitle: { fontSize: 12.5, fontFamily: F800, color: '#8A5310' },
  escalateBody: { fontSize: 11.5, lineHeight: 16.5, color: '#7d6234', fontFamily: F500 },
  escalateCta: {
    backgroundColor: WA,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  escalateCtaText: { color: '#fff', fontSize: 12.5, fontFamily: F800 },

  errorBox: {
    backgroundColor: '#fdeceb',
    borderRadius: 16,
    padding: 12,
    gap: 9,
  },
  errorText: { color: '#A33B22', fontSize: 12, lineHeight: 17, fontFamily: F600 },

  suggests: { gap: 7, marginTop: 2 },
  suggest: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#dfe6e0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  suggestText: { fontSize: 11.5, color: GREEN_D, fontFamily: F700 },

  composer: {
    // The mic, the field and the send button are siblings on ONE line.
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e6e9e4',
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    backgroundColor: '#f4f6f2',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 13,
    fontFamily: F500,
    color: INK,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GREEN_D,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { backgroundColor: '#c3ccc6' },
});
