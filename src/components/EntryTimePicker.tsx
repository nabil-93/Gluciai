import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { nowMs } from '@/lib/clock';
import { shadows } from '@/theme';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const MIN = 60_000;
const SMALL = 5 * MIN;
const BIG = 60 * MIN;
/** How far back a manual entry may go — older belongs in a doctor's export, not a quick log. */
const MAX_BACK = 24 * 60 * MIN;

/**
 * WHEN DID IT HAPPEN (store audit F-08).
 *
 * Manual glucose and insulin entries were always stamped "now", so a dose
 * injected at 13:00 and logged at 15:00 sat two hours late in the journal —
 * and the insulin-on-board shown to the patient was two hours too high. The
 * time can now be moved back in 5-minute or 1-hour steps (never into the
 * future, never more than 24 h back). `null` means "now": it is read at the
 * moment of saving, so a screen left open does not stamp a stale time.
 */
export function EntryTimePicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (ms: number | null) => void;
}) {
  const { t, i18n } = useTranslation();

  const move = (delta: number) => {
    const now = nowMs();
    // The first step back from "now" lands on the previous 5-minute mark.
    const base = value ?? (delta < 0 ? Math.ceil(now / SMALL) * SMALL : now);
    const next = base + delta;
    if (next >= now) return onChange(null);
    onChange(Math.max(now - MAX_BACK, next));
  };

  const label = (() => {
    if (value == null) return t('log.whenNow');
    const d = new Date(value);
    const time = d.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
    const sameDay = d.toDateString() === new Date(nowMs()).toDateString();
    return sameDay ? time : `${t('log.whenYesterday')} ${time}`;
  })();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('log.whenLabel')}</Text>
      <View style={styles.row}>
        <Step text="−1 h" onPress={() => move(-BIG)} a11y={t('log.whenEarlier')} />
        <Step text="−5" onPress={() => move(-SMALL)} a11y={t('log.whenEarlier')} />
        <Text style={[styles.value, value == null && styles.valueNow]} numberOfLines={1}>
          {label}
        </Text>
        <Step
          text="+5"
          onPress={() => move(SMALL)}
          disabled={value == null}
          a11y={t('log.whenLater')}
        />
        <Step
          text="+1 h"
          onPress={() => move(BIG)}
          disabled={value == null}
          a11y={t('log.whenLater')}
        />
      </View>
      {value != null ? (
        <Pressable onPress={() => onChange(null)} hitSlop={8} style={styles.reset}>
          <Text style={styles.resetText}>{t('log.whenBackToNow')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Step({
  text,
  onPress,
  disabled,
  a11y,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  a11y: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.step, disabled && styles.stepOff]}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${text}`}
    >
      <Text style={styles.stepText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginTop: 22,
    ...shadows.card,
  },
  title: { fontFamily: F700, fontSize: 12, color: '#67736B', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#EEF5F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: { opacity: 0.35 },
  stepText: { fontFamily: F700, fontSize: 13, color: '#0F7A42' },
  value: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontFamily: F800,
    fontSize: 17,
    color: '#1e2a23',
  },
  valueNow: { color: '#0F7A42' },
  reset: { alignSelf: 'center', marginTop: 10 },
  resetText: { fontFamily: F600, fontSize: 12.5, color: '#2f7cf6' },
});
