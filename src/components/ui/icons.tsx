import React from 'react';
import Svg, { Circle, Path, Rect, Line, Ellipse } from 'react-native-svg';

import { colors } from '@/theme';

type IconProps = { size?: number; color?: string };

/** Right chevron / arrow used on rows and detail links */
export function ChevronRight({ size = 18, color = '#C2C2C8' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 12h13M13 6l6 6-6 6"
        stroke={color}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Down chevron next to the date title */
export function ChevronDown({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M5 7.5l5 5 5-5"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Back chevron for detail-page headers */
export function ChevronLeft({ size = 18, color = colors.text }: IconProps) {
  return (
    <Svg width={(size * 11) / 18} height={size} viewBox="0 0 11 18">
      <Path
        d="M9 1L1.5 9 9 17"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Activity / running figure */
export function ActivityGlyph({ size = 22, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={14.5} cy={4.3} r={2.1} fill={color} />
      <Path
        d="M13 8.2l-3.8 4.2 3.6 2.4.6 5.4M13 8.2l3.4 2.1 3-1M13 8.2l-4.6.4-2 3.2M9.2 14.6l-2.4 5"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Info circle */
export function InfoCircle({ size = 20, color = '#8A8A90', mark = '#fff' }: IconProps & { mark?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.5} fill={color} />
      <Rect x={10.9} y={10.5} width={2.2} height={6.3} rx={1.1} fill={mark} />
      <Circle cx={12} cy={7.6} r={1.2} fill={mark} />
    </Svg>
  );
}

/** Alert warning circle (orange) */
export function AlertCircle({ size = 21 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      <Circle cx={11} cy={11} r={10} fill={colors.warning} />
      <Rect x={9.9} y={5.4} width={2.2} height={7} rx={1.1} fill="#fff" />
      <Circle cx={11} cy={15.7} r={1.4} fill="#fff" />
    </Svg>
  );
}

/** Heart (biology / cycle) */
export function HeartGlyph({ size = 22, color = '#141418' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 20.5S3.5 15 3.5 8.9C3.5 6 5.7 4 8.2 4c1.6 0 3 .9 3.8 2.1C12.8 4.9 14.2 4 15.8 4c2.5 0 4.7 2 4.7 4.9 0 6.1-8.5 11.6-8.5 11.6z"
        fill={color}
      />
    </Svg>
  );
}

/** Flame (energy / calories) */
export function FlameGlyph({ size = 20, color = colors.warning }: IconProps) {
  return (
    <Svg width={(size * 17) / 20} height={size} viewBox="0 0 18 22">
      <Path
        d="M10.5 1L2 12.5h5.5L6 21l9.5-11.5H10L10.5 1z"
        fill={color}
      />
    </Svg>
  );
}

/** Star (insights) */
export function StarGlyph({ size = 20, color = '#8A8A90' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3l1.6 4.8 5 .3-3.9 3.2 1.4 4.9L12 13.4l-4.1 2.8 1.4-4.9-3.9-3.2 5-.3z"
        fill={color}
      />
    </Svg>
  );
}

/** Lock (nutrition score locked) */
export function LockGlyph({ size = 22, color = '#96969C' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5.5} y={10.5} width={13} height={9.5} rx={3} fill={color} />
      <Path
        d="M8.7 10.5V8a3.3 3.3 0 016.6 0v2.5"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
      />
    </Svg>
  );
}

/** Pulse / HRV */
export function PulseGlyph({ size = 20, color = '#8A8A90' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M2 12h4l2-6 3 12 2-8 2 4h5"
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Clock */
export function ClockGlyph({ size = 20, color = '#8A8A90' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12 7v5l3.5 2" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Checkmark badge (normal range) */
export function CheckBadge({ size = 18, color = '#37B24D' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill={color} />
      <Path
        d="M8 12.2l2.6 2.6L16 9.5"
        stroke="#fff"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Empty "no trend" x-circle */
export function NoDataGlyph({ size = 18 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="#D2D2D7" />
      <Path d="M9 9l6 6M15 9l-6 6" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Search */
export function SearchGlyph({ size = 18, color = '#8A8A90' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10.5} cy={10.5} r={6.5} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M15.5 15.5L20 20" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Home (bevel bottom-nav home glyph) */
export function HomeGlyph({ size = 24, color = '#141418' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3.2l8.5 7v10.3h-5.6v-5.8h-5.8v5.8H3.5V10.2L12 3.2z"
        fill={color}
      />
    </Svg>
  );
}

/** Plus */
export function PlusGlyph({ size = 20, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 4.5v15M4.5 12h15" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Close X */
export function CloseGlyph({ size = 18, color = colors.text }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 4l16 16M20 4L4 20" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

/** Weather / paper-plane (météo chip) */
export function PaperPlane({ size = 19, color = '#ABABB2' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 3.5L3.5 10.8l7.2 2.7 2.6 7L21 3.5z" fill={color} />
    </Svg>
  );
}

/** Small utensils / fork (macro) */
export function ForkGlyph({ size = 14, color = '#A2A2A9' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path d="M2 14L13 3" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Ellipse cx={9} cy={7} rx={2.6} ry={1.9} transform="rotate(-45 9 7)" fill={color} />
    </Svg>
  );
}

/** Bolt / lightning (energy) */
export function BoltGlyph({ size = 26, color = colors.warning }: IconProps) {
  return (
    <Svg width={(size * 17) / 21} height={size} viewBox="0 0 18 22">
      <Path d="M10.5 1L2 12.5h5.5L6 21l9.5-11.5H10L10.5 1z" fill={color} />
    </Svg>
  );
}

/** Ticks-based gauge markers helper: returns tick lines around a circle */
export function radialTicks(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  count: number,
  startDeg = -220,
  endDeg = 40,
) {
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const deg = startDeg + t * (endDeg - startDeg);
    const rad = (deg * Math.PI) / 180;
    ticks.push({
      x1: cx + rInner * Math.cos(rad),
      y1: cy + rInner * Math.sin(rad),
      x2: cx + rOuter * Math.cos(rad),
      y2: cy + rOuter * Math.sin(rad),
    });
  }
  return ticks;
}

export { Line };
