import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { TFunction } from 'i18next';

import type { DayEvent } from '@/services/dayLog';

/**
 * Every glyph the journal can show — the four day metrics (glucose, carbs,
 * insulin, activity) AND the other things a patient action writes to the
 * journal: a body measure, a note, an activity-status change, a settings
 * change. Each is drawn bold and mostly filled so it stays crisp in the small
 * coloured circles the timeline and overview cards use.
 */

type P = { size?: number; color?: string };

/** Glucose — a blood droplet with an inner leaf, the app's glucose mark. */
export function DropIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.6c3.7 4.3 6.4 7.4 6.4 10.8A6.4 6.4 0 1 1 5.6 13.4C5.6 10 8.3 6.9 12 2.6z"
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M12.6 8.2c1.9 2.2 3 3.9 2.5 5.7a2.9 2.9 0 0 1-4 1.9c1.4-.1 2.5-.9 2.8-2.3.3-1.4-.3-3.2-1.3-5.3z"
        fill={color}
      />
    </Svg>
  );
}

/** Carbs / meal — fork & knife. */
export function ForkIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 2.5v5.2a2 2 0 0 1-4 0V2.5M5 8v13" />
      <Path d="M17.5 2.5c-1.7 0-2.8 2.2-2.8 5.2s1.1 4 2.8 4 M17.5 3v18" />
    </Svg>
  );
}

/** Insulin — a syringe (plunger, graduated barrel, needle). */
export function SyringeIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m18 2 4 4" />
      <Path d="m21 3-2.5 2.5" />
      <Path d="M16.5 5.5 19 8l-8.7 8.7a1.4 1.4 0 0 1-.7.4L6 18l.9-3.6a1.4 1.4 0 0 1 .4-.7z" fill={color} fillOpacity={0.18} />
      <Path d="m13.5 7 1.8 1.8M11 9.5l1.8 1.8" strokeWidth={1.5} />
      <Path d="M6 18 3 21" />
    </Svg>
  );
}

/**
 * Activity — the same filled runner the Activité tab draws in the bottom bar
 * (see BevelTabBar), so the journal and the tab bar speak with one glyph.
 */
export function RunIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.89 19.38l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
    </Svg>
  );
}

/** Body measure — a scale / weight. */
export function ScaleIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={4} />
      <Path d="M12 7v3" />
      <Path d="M9.5 10.5 12 8l2.5 2.5" fill={color} fillOpacity={0.2} />
      <Circle cx={12} cy={16} r={0.4} fill={color} stroke={color} />
    </Svg>
  );
}

/** Note — a lined note. */
export function NoteIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 3h11l4 4v14a0 0 0 0 1 0 0H5a0 0 0 0 1 0 0z" />
      <Path d="M15 3v5h5M8.5 13h7M8.5 16.5h5" />
    </Svg>
  );
}

/** Activity-status change — a heart with a pulse. */
export function StatusIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.8 8.6a5 5 0 0 0-8.8-2.7A5 5 0 0 0 3.2 8.6c0 3.6 4.9 7 8.8 9.9 3.9-2.9 8.8-6.3 8.8-9.9z" />
      <Path d="M7 12h2l1.5-2.5L12.5 14l1-2h3.5" strokeWidth={1.6} />
    </Svg>
  );
}

/** Settings / profile change — a gear. */
export function GearIcon({ size = 20, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 2v3M12 19v3M22 12h-3M5 12H2M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" />
    </Svg>
  );
}

export type MetricKey = 'glucose' | 'carbs' | 'insulin' | 'activity';
export type LogoKey = MetricKey | 'measure' | 'note' | 'status' | 'settings';

export interface Logo {
  color: string;
  textColor: string;
  tint: string;
  Icon: React.ComponentType<P>;
}

/**
 * Colour + tint + glyph for every journal entry type. `color` paints graphics;
 * `textColor` is the darker twin used whenever the colour carries TEXT on
 * white (the bright graphic hues fall under WCAG AA as type).
 */
export const LOGO: Record<LogoKey, Logo> = {
  glucose: { color: '#17A24A', textColor: '#0F7A42', tint: '#E4F7EC', Icon: DropIcon },
  carbs: { color: '#F97316', textColor: '#B45309', tint: '#FEEEE0', Icon: ForkIcon },
  insulin: { color: '#8B5CF6', textColor: '#6D28D9', tint: '#EFE9FD', Icon: SyringeIcon },
  activity: { color: '#3B82F6', textColor: '#2563EB', tint: '#E4EEFE', Icon: RunIcon },
  measure: { color: '#0EA5A5', textColor: '#0E7490', tint: '#DCF7F7', Icon: ScaleIcon },
  note: { color: '#D97706', textColor: '#B45309', tint: '#FEF1DE', Icon: NoteIcon },
  status: { color: '#EC4899', textColor: '#BE185D', tint: '#FCE7F1', Icon: StatusIcon },
  settings: { color: '#64748B', textColor: '#475569', tint: '#EEF1F5', Icon: GearIcon },
};

/** The overview cards only ever show the four core metrics. */
export const METRIC: Record<MetricKey, Logo> = {
  glucose: LOGO.glucose,
  carbs: LOGO.carbs,
  insulin: LOGO.insulin,
  activity: LOGO.activity,
};

/** The right palette + glyph for ANY journal entry — meals, readings, doses,
 *  sport, body measures, notes, status changes and settings changes. */
export function logoFor(e: DayEvent): Logo {
  switch (e.kind) {
    case 'meal':
      return LOGO.carbs;
    case 'glucose':
      return LOGO.glucose;
    case 'insulin':
      return LOGO.insulin;
    case 'activity':
      return LOGO.activity;
    case 'measure':
      return LOGO.measure;
    case 'event':
      return e.event.kind === 'note'
        ? LOGO.note
        : e.event.kind === 'status'
          ? LOGO.status
          : LOGO.settings;
  }
}

export function CalendarGlyph({ size = 22, color = '#fff' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 2v3M16 2v3M3.5 9h17" />
      <Path d="M4 5.5h16a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" />
    </Svg>
  );
}

/**
 * Localised label for a stored activity kind ('walk' | 'run' | 'bike' | 'gym'
 * | 'other'). The raw kind was being shown straight from the record, so a
 * French user saw "walk"/"run" in an otherwise French timeline. The labels
 * already exist under `activityScreen.kind*`; this maps to them, falling back
 * to the raw value for any kind that predates the list.
 */
export function activityKindLabel(t: TFunction, kind: string): string {
  const cap = kind.charAt(0).toUpperCase() + kind.slice(1);
  return t(`activityScreen.kind${cap}`, { defaultValue: kind });
}
