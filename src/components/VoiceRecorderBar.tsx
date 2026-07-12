import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import {
  VOICE_NOTE_MAX_MS,
  VoiceNoteRecorder,
} from '@/services/aiLogger';

const F700 = 'PlusJakartaSans_700Bold';

const WAVE_BARS = 22;

export function MicIcon({ active }: { active: boolean }) {
  const color = active ? '#ffffff' : '#3b4657';
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Rect x={9} y={3} width={6} height={11} rx={3} fill={color} />
      <Path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

/** True when this device can record audio for a voice note. */
export const canRecordVoice =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia;

/**
 * Live "recording" indicator: a red pulsing dot + a bank of bars that move
 * with the patient's actual voice level. Shared by the logging assistant
 * and the regular chat.
 */
function RecordingWave({ level }: { level: number }) {
  const { t } = useTranslation();
  const bars = useRef(
    Array.from({ length: WAVE_BARS }, () => new Animated.Value(0.12))
  ).current;
  const levels = useRef<number[]>(Array(WAVE_BARS).fill(0.12)).current;
  const dot = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dot, { toValue: 0.3, duration: 550, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 1, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dot]);

  useEffect(() => {
    for (let i = 0; i < WAVE_BARS - 1; i++) levels[i] = levels[i + 1];
    const jitter = 0.75 + Math.random() * 0.5;
    levels[WAVE_BARS - 1] = Math.max(0.12, Math.min(1, level * jitter));
    for (let i = 0; i < WAVE_BARS; i++) {
      Animated.timing(bars[i], {
        toValue: levels[i],
        duration: 90,
        useNativeDriver: false,
      }).start();
    }
  }, [level, bars, levels]);

  return (
    <View style={styles.waveWrap}>
      <Animated.View style={[styles.recDot, { opacity: dot }]} />
      <Text style={styles.recText}>{t('logger.recording')}</Text>
      <View style={styles.waveBars}>
        {bars.map((v, i) => (
          <Animated.View
            key={i}
            style={[
              styles.waveBar,
              {
                height: v.interpolate({ inputRange: [0, 1], outputRange: [4, 26] }),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Full recording flow as a self-contained control: tap-to-record with an
 * audible start/stop cue and a live waveform, then delivers the recorded
 * WAV to `onAudio`. While idle it renders nothing but the mic button (the
 * parent lays out its own text input beside it); while recording it takes
 * over the row with the waveform + stop button.
 */
export function VoiceRecorderBar({
  disabled,
  onAudio,
  onDenied,
  children,
}: {
  disabled?: boolean;
  onAudio: (audio: { mimeType: string; data: string }) => void;
  onDenied?: () => void;
  /** The idle-state input (text field + send button) shown when not recording. */
  children: React.ReactNode;
}) {
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const recRef = useRef<VoiceNoteRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = (send: boolean) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    setLevel(0);
    if (!rec) return;
    if (!send) {
      rec.cancel();
      return;
    }
    const audio = rec.stop(); // plays the stop cue
    if (audio) onAudio(audio);
  };

  const start = async () => {
    if (disabled) return;
    try {
      const rec = new VoiceNoteRecorder();
      rec.onLevel = (lvl) => setLevel(lvl);
      await rec.start(); // plays the start cue; must be inside the tap (iOS)
      recRef.current = rec;
      setListening(true);
      setLevel(0);
      timerRef.current = setTimeout(() => stop(true), VOICE_NOTE_MAX_MS);
    } catch {
      recRef.current = null;
      setListening(false);
      onDenied?.();
    }
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recRef.current?.cancel();
    },
    []
  );

  if (listening) {
    return (
      <>
        <RecordingWave level={level} />
        <Pressable onPress={() => stop(true)} style={styles.stopBtn}>
          <View style={styles.stopSquare} />
        </Pressable>
      </>
    );
  }

  return (
    <>
      {canRecordVoice ? (
        <Pressable onPress={start} style={styles.micBtn} disabled={disabled}>
          <MicIcon active={false} />
        </Pressable>
      ) : null}
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    backgroundColor: '#fdeaea',
    borderRadius: 22,
    paddingHorizontal: 14,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  recText: { fontFamily: F700, fontSize: 12, color: '#c62828' },
  waveBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2.5,
    height: 30,
  },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: '#ef4444' },
  stopBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  stopSquare: { width: 15, height: 15, borderRadius: 3, backgroundColor: '#ffffff' },
});
