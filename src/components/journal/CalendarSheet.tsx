import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DayPickerSheet } from '@/components/calendar/DayPickerSheet';
import type { DayRing } from '@/components/calendar/RingCalendar';
import { useAppStore } from '@/store/useAppStore';

const IN_RANGE = '#19C37D';
const MID = '#F2B84B';
// A deep red, not the soft coral — a day under 40 % in range must read as
// clearly bad at a glance.
const LOW = '#DC2626';

/**
 * The journal's day picker. Each day's ring fills with that day's glucose
 * time-in-range — green for a day mostly on target, amber for a mixed one,
 * red for a hard one — so the patient can scan a whole month at a glance and
 * jump straight to any past day.
 */
export function CalendarSheet({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { glucoseLogs, profile } = useAppStore();
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  // Per-day time-in-range, keyed by date string.
  const tirByDay = useMemo(() => {
    const map = new Map<string, { inRange: number; count: number }>();
    for (const g of glucoseLogs) {
      const key = new Date(g.created_at).toDateString();
      const cur = map.get(key) ?? { inRange: 0, count: 0 };
      map.set(key, {
        inRange: cur.inRange + (g.value >= low && g.value <= high ? 1 : 0),
        count: cur.count + 1,
      });
    }
    return map;
  }, [glucoseLogs, low, high]);

  const ringFor = (d: Date): DayRing => {
    const s = tirByDay.get(d.toDateString());
    if (!s || s.count === 0) return null;
    const tir = s.inRange / s.count;
    return {
      kind: 'progress',
      value: tir,
      color: tir >= 0.7 ? IN_RANGE : tir >= 0.4 ? MID : LOW,
    };
  };

  return (
    <DayPickerSheet
      open={open}
      selected={selected}
      onSelect={onSelect}
      onClose={onClose}
      ringFor={ringFor}
      title={t('journalV2.legendTitle')}
      caption={t('journalV2.legendTarget', { low, high })}
      hint={t('journalV2.legendRingHint')}
      legend={[
        { color: IN_RANGE, key: t('journalV2.legendPctHigh'), label: t('journalV2.legendHigh') },
        { color: MID, key: t('journalV2.legendPctMid'), label: t('journalV2.legendMid') },
        { color: LOW, key: t('journalV2.legendPctLow'), label: t('journalV2.legendLow') },
      ]}
    />
  );
}
