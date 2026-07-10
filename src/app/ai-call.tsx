import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import { sendChatMessage } from '@/services/ai';
import { useAppStore } from '@/store/useAppStore';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* BCP-47 tags for speech recognition / synthesis per app language */
const LANG_TAGS: Record<string, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  en: 'en-US',
  ar: 'ar-MA',
};

type CallStatus = 'listening' | 'thinking' | 'speaking' | 'muted' | 'unsupported';

/* ── Small SVG icons ── */
function MicIcon({ off = false, color = '#3b4657' }: { off?: boolean; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3z"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
      />
      <Path
        d="M6 11a6 6 0 0012 0M12 17v4"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
      {off ? (
        <Path d="M4 4l16 16" stroke="#ef4444" strokeWidth={2.4} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}
function PhoneDownIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path
        d="M3.5 14.5c5-4.5 12-4.5 17 0l-2 3c-.6.9-1.8 1.2-2.8.7l-2-1a2 2 0 01-1.1-1.8v-1.2a13 13 0 00-5.2 0v1.2a2 2 0 01-1.1 1.8l-2 1c-1 .5-2.2.2-2.8-.7l-2-3z"
        fill="#ffffff"
        transform="rotate(0 12 12)"
      />
    </Svg>
  );
}
function SpeakerIcon({ off = false, color = '#3b4657' }: { off?: boolean; color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d="M4 9v6h4l5 4V5L8 9H4z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      {off ? (
        <Path d="M17 9l4 6M21 9l-4 6" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" />
      ) : (
        <Path
          d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  );
}
function BulbIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0012 3z"
        stroke="#8a3ffc"
        strokeWidth={2}
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M10 20h4" stroke="#8a3ffc" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Animated voice waveform — bars dance while the call is active. */
function Waveform({ active }: { active: boolean }) {
  const N = 27;
  const vals = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;
  useEffect(() => {
    if (!active) {
      vals.forEach((v) => v.setValue(0.18));
      return;
    }
    const loops = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 90),
          Animated.timing(v, {
            toValue: 1,
            duration: 260 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 260 + i * 40,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Center-heavy silhouette like the mockup
  const base = (i: number) => {
    const d = Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
    return 8 + (1 - d * d) * 22;
  };
  return (
    <View style={styles.waveRow}>
      {Array.from({ length: N }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              height: base(i),
              transform: [{ scaleY: vals[i % 5] }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function AiCallScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const profile = useAppStore((s) => s.profile);

  const [status, setStatus] = useState<CallStatus>('listening');
  const [advice, setAdvice] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);

  const statusRef = useRef<CallStatus>('listening');
  const micOnRef = useRef(true);
  const speakerOnRef = useRef(true);
  const recRef = useRef<any>(null);
  const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const endedRef = useRef(false);

  const setStatusSafe = (s: CallStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const langTag = LANG_TAGS[i18n.language] ?? 'en-US';
  const SR =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const canVoice =
    !!SR && typeof window !== 'undefined' && !!(window as any).speechSynthesis;

  /* ── Call timer ── */
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  /* ── Speech: listen → Gemini → speak → listen again ── */
  const startListening = () => {
    if (endedRef.current || !canVoice || !micOnRef.current) return;
    setStatusSafe('listening');
    try {
      if (!recRef.current) {
        const rec = new SR();
        rec.lang = langTag;
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e: any) => {
          const text = e.results?.[0]?.[0]?.transcript?.trim();
          if (text) handleUserSpeech(text);
        };
        rec.onend = () => {
          // Browsers stop after a silence — keep the mic open while the
          // call is in listening state.
          if (!endedRef.current && statusRef.current === 'listening' && micOnRef.current) {
            setTimeout(() => {
              try {
                recRef.current?.start();
              } catch {
                /* already started */
              }
            }, 250);
          }
        };
        rec.onerror = () => {};
        recRef.current = rec;
      }
      recRef.current.start();
    } catch {
      /* start() throws if already running — fine */
    }
  };

  const stopListening = () => {
    try {
      recRef.current?.stop();
    } catch {}
  };

  const speak = (text: string) => {
    if (endedRef.current) return;
    if (!speakerOnRef.current || !canVoice) {
      startListening();
      return;
    }
    setStatusSafe('speaking');
    const synth = (window as any).speechSynthesis;
    synth.cancel();
    const u = new (window as any).SpeechSynthesisUtterance(text);
    u.lang = langTag;
    u.rate = 1;
    u.onend = () => {
      if (!endedRef.current) startListening();
    };
    u.onerror = () => {
      if (!endedRef.current) startListening();
    };
    synth.speak(u);
  };

  const handleUserSpeech = async (text: string) => {
    stopListening();
    setStatusSafe('thinking');
    historyRef.current = [...historyRef.current, { role: 'user', content: text }];
    try {
      const reply = await sendChatMessage(
        historyRef.current,
        i18n.language,
        profile,
        'voice'
      );
      historyRef.current = [
        ...historyRef.current,
        { role: 'assistant', content: reply },
      ];
      setAdvice(reply);
      speak(reply);
    } catch {
      setAdvice(t('common.error'));
      startListening();
    }
  };

  /* Start / cleanup */
  useEffect(() => {
    if (!canVoice) {
      setStatusSafe('unsupported');
      return;
    }
    startListening();
    return () => {
      endedRef.current = true;
      try {
        recRef.current?.abort?.();
        recRef.current?.stop?.();
      } catch {}
      try {
        (window as any).speechSynthesis?.cancel();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = () => {
    const next = !micOnRef.current;
    micOnRef.current = next;
    setMicOn(next);
    if (!next) {
      stopListening();
      if (statusRef.current === 'listening') setStatusSafe('muted');
    } else if (statusRef.current === 'muted') {
      startListening();
    }
  };

  const toggleSpeaker = () => {
    const next = !speakerOnRef.current;
    speakerOnRef.current = next;
    setSpeakerOn(next);
    if (!next && statusRef.current === 'speaking') {
      try {
        (window as any).speechSynthesis?.cancel();
      } catch {}
      startListening();
    }
  };

  const endCall = () => {
    endedRef.current = true;
    try {
      recRef.current?.abort?.();
      recRef.current?.stop?.();
    } catch {}
    try {
      (window as any).speechSynthesis?.cancel();
    } catch {}
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const statusText =
    status === 'listening'
      ? t('call.listening')
      : status === 'thinking'
        ? t('call.thinking')
        : status === 'speaking'
          ? t('call.speaking')
          : status === 'muted'
            ? t('call.muted')
            : t('call.unsupported');

  const active = status === 'listening' || status === 'speaking';

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={endCall} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('call.title')}</Text>
          <Text style={styles.headerSub}>{t('call.sub')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Robot in halo ── */}
      <View style={styles.stage}>
        <View style={styles.haloOuter}>
          <View style={styles.haloMid}>
            <View style={styles.haloInner}>
              <AnimatedRobot size={92} mood="happy" />
            </View>
          </View>
        </View>

        <Waveform active={active} />

        <Text style={styles.statusText}>{statusText}</Text>
        <Text style={styles.timer}>
          {mm}:{ss}
        </Text>
      </View>

      {/* ── Live advice card ── */}
      <View style={styles.adviceCard}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.adviceKicker}>{t('call.adviceTitle')}</Text>
          <Text style={styles.adviceText} numberOfLines={4}>
            {advice ?? t('call.adviceEmpty')}
          </Text>
        </View>
        <View style={styles.adviceBulb}>
          <BulbIcon />
        </View>
      </View>

      {/* ── Controls ── */}
      <View style={styles.controls}>
        <View style={styles.controlCol}>
          <Pressable
            onPress={toggleMic}
            style={[styles.roundBtn, !micOn && styles.roundBtnOff]}
            disabled={status === 'unsupported'}
          >
            <MicIcon off={!micOn} />
          </Pressable>
          <Text style={styles.controlLabel}>{t('call.mute')}</Text>
        </View>

        <View style={styles.controlCol}>
          <Pressable onPress={endCall} style={styles.endBtn}>
            <PhoneDownIcon />
          </Pressable>
          <Text style={styles.controlLabel}>{t('call.end')}</Text>
        </View>

        <View style={styles.controlCol}>
          <Pressable
            onPress={toggleSpeaker}
            style={[styles.roundBtn, !speakerOn && styles.roundBtnOff]}
            disabled={status === 'unsupported'}
          >
            <SpeakerIcon off={!speakerOn} />
          </Pressable>
          <Text style={styles.controlLabel}>{t('call.speaker')}</Text>
        </View>
      </View>

      {/* ── Safety note ── */}
      <View
        style={[
          styles.safetyCard,
          { marginBottom: Math.max(insets.bottom, 12) + 8 },
        ]}
      >
        <Text style={styles.safetyText}>{t('call.safety')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe', paddingHorizontal: 18 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    marginHorizontal: -18,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: { fontFamily: F800, fontSize: 16.5, color: '#111827' },
  headerSub: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 1 },

  stage: { alignItems: 'center', marginTop: 10 },
  haloOuter: {
    width: 208,
    height: 208,
    borderRadius: 104,
    backgroundColor: '#f0ebfd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloMid: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#e4dbfb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(90,60,180,1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },

  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    marginTop: 20,
  },
  waveBar: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: '#19c37d',
  },

  statusText: { fontFamily: F800, fontSize: 17, color: '#111827', marginTop: 14 },
  timer: { fontFamily: F600, fontSize: 13, color: '#8b93a7', marginTop: 4 },

  adviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f3f0ff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  adviceKicker: { fontFamily: F700, fontSize: 12, color: '#6d5ef9', marginBottom: 3 },
  adviceText: { fontFamily: F500, fontSize: 12.5, lineHeight: 18, color: '#3b4657' },
  adviceBulb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
    marginTop: 22,
  },
  controlCol: { alignItems: 'center', gap: 7, width: 90 },
  roundBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  roundBtnOff: { backgroundColor: '#fdeaea' },
  endBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  controlLabel: {
    fontFamily: F600,
    fontSize: 10.5,
    color: '#8b93a7',
    textAlign: 'center',
  },

  safetyCard: {
    backgroundColor: '#e9f6ef',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginTop: 'auto',
  },
  safetyText: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#4a6b58',
    textAlign: 'center',
  },
});
