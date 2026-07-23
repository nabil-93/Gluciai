import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { nowDate } from '@/lib/clock';

import { RingCalendar, type DayRing } from './RingCalendar';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';
const INK = '#1E2430';
const MUTED = '#5B6472';

export interface LegendEntry {
  color: string;
  /** The bold token on the left — "≥ 70 %", "Rapide"… */
  key?: string;
  label: string;
  /** Rings on this row draw as a filled disc instead of a hollow ring. */
  filled?: boolean;
}

/**
 * The day picker every tracking screen shares: a title, a short block saying
 * what the rings mean on THIS screen, the month grid, and a jump-to-today
 * button. Only the legend and the ring data change from screen to screen.
 */
export function DayPickerSheet({
  open,
  title,
  caption,
  legend,
  hint,
  selected,
  onSelect,
  onClose,
  ringFor,
}: {
  open: boolean;
  title: string;
  /** One line under the title — the target band, the daily goal… */
  caption?: string;
  legend?: LegendEntry[];
  /** Small footnote at the bottom of the legend block. */
  hint?: string;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  ringFor: (d: Date) => DayRing;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('journalV2.selectDay')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityRole="button">
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>

          {legend?.length ? (
            <View style={styles.legendBox}>
              <Text style={styles.legendTitle}>{title}</Text>
              {caption ? <Text style={styles.legendCaption}>{caption}</Text> : null}
              <View style={styles.legendRows}>
                {legend.map((l, i) => (
                  <View key={i} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendRing,
                        { borderColor: l.color },
                        l.filled && { backgroundColor: l.color },
                      ]}
                    />
                    {l.key ? <Text style={styles.legendKey}>{l.key}</Text> : null}
                    <Text style={styles.legendLabel} numberOfLines={1}>
                      {l.label}
                    </Text>
                  </View>
                ))}
              </View>
              {hint ? <Text style={styles.legendHint}>{hint}</Text> : null}
            </View>
          ) : null}

          <View style={styles.calWrap}>
            <RingCalendar
              selected={selected}
              locale={i18n.language}
              ringFor={ringFor}
              selectedVariant="ring"
              onSelect={(d) => {
                onSelect(d);
                onClose();
              }}
            />
          </View>

          <Pressable
            style={styles.todayBtn}
            accessibilityRole="button"
            onPress={() => {
              onSelect(nowDate());
              onClose();
            }}
          >
            <Text style={styles.todayBtnText}>{t('timeline.today')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 366,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F800, fontSize: 15.5, color: INK },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F2F5', alignItems: 'center', justifyContent: 'center' },
  closeX: { fontSize: 14, color: MUTED, fontFamily: F700 },

  legendBox: { marginTop: 12, backgroundColor: '#F6F7F9', borderRadius: 14, padding: 11 },
  legendTitle: { fontFamily: F800, fontSize: 11.5, color: INK },
  legendCaption: { fontFamily: F600, fontSize: 10, color: MUTED, marginTop: 1 },
  legendRows: { marginTop: 7, gap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendRing: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.4 },
  legendKey: { fontFamily: F800, fontSize: 10.5, color: INK, width: 52 },
  legendLabel: { fontFamily: F600, fontSize: 10.5, color: MUTED, flex: 1, minWidth: 0 },
  legendHint: { fontFamily: F600, fontSize: 9.5, color: '#8B94A3', marginTop: 8 },

  calWrap: { marginTop: 14 },

  todayBtn: {
    marginTop: 10,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4F7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtnText: { fontFamily: F800, fontSize: 12.5, color: '#0F7A42' },
});
