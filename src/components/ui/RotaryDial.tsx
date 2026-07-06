import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useReduceMotion } from './motion';

/**
 * RotaryDial — faithful port of the "Rotary Dial" skeuomorphic design
 * (Nutrition/dewara/Rotary Dial.dc.html). A recessed white face with an
 * arc of colored ticks (green → yellow → red), a teal pointer, and a
 * centered value (or a dash when there's no value).
 *
 * The SVG geometry is a 1:1 copy of the source — same center (627.5,
 * 597.5 in a 1254 viewBox), same tick sweep (224.3° start, 268.2° span,
 * 71 ticks), same pointer triangle and color ramp.
 */

const VB = 1254; // viewBox size
const CX = 627.5;
const CY = 597.5;
const R_FACE = 555;
// Smaller recessed inner face → the colored tick ring reads bigger/bolder.
const R_INNER = 360;

// Ticks — longer and set further in so the color ring dominates.
const T_IN = 430;
const T_OUT = 505;
const START = 224.3;
const SWEEP = 268.2;
const N = 71;
const TICK_W_IDLE = 8;
const TICK_W_ACTIVE = 9.5;

// Pointer — tucked just inside the (now smaller) inner face.
const TIP_R = 500;
const BASE_R = 365;
const BASE_HALF = 13;

const POINTER_COLOR = '#58c4bc';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** HSL → hex so the color is unambiguous on both web and native SVG. */
function hslToHex(h: number, s: number, l: number) {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const color = lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

interface Tick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Fraction 0..1 of this tick along the arc (0 = green start). */
  f: number;
  /** Faint resting color (source design). */
  idle: string;
  /** Saturated color, shown once the value reaches this tick. */
  active: string;
  /** Base opacity (softens the two end ticks). */
  op: number;
}

function buildTicks(): Tick[] {
  const ticks: Tick[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const th = ((START - SWEEP * f) * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    // Same hue ramp as the source (green → yellow → red).
    const hue = 6 + 122 * Math.pow(1 - f, 1.5);
    // Idle: soft, pale (the resting look from the design).
    const idleSat = 45 + 16 * Math.sin(Math.PI * f);
    const idleLig = 85 + 2 * (1 - Math.sin(Math.PI * f));
    // Active: pushed to a rich, saturated, vivid tone.
    const activeSat = 82 + 10 * Math.sin(Math.PI * f);
    const activeLig = 52;
    const edge = Math.min(i, N - 1 - i);
    const op = 0.4 + 0.6 * Math.min(1, edge / 4);
    ticks.push({
      x1: r2(CX + T_IN * cos),
      y1: r2(CY - T_IN * sin),
      x2: r2(CX + T_OUT * cos),
      y2: r2(CY - T_OUT * sin),
      f,
      idle: hslToHex(hue, idleSat, idleLig),
      active: hslToHex(hue, activeSat, activeLig),
      op: r2(op),
    });
  }
  return ticks;
}

// Geometry & colors never change — compute once at module load.
const TICKS = buildTicks();

function buildPointer(pct: number) {
  const th = ((START - SWEEP * (pct / 100)) * Math.PI) / 180;
  const ux = Math.cos(th);
  const uy = -Math.sin(th);
  const px = Math.sin(th);
  const py = Math.cos(th);
  const bx = CX + BASE_R * ux;
  const by = CY + BASE_R * uy;
  return [
    `${r2(CX + TIP_R * ux)},${r2(CY + TIP_R * uy)}`,
    `${r2(bx + BASE_HALF * px)},${r2(by + BASE_HALF * py)}`,
    `${r2(bx - BASE_HALF * px)},${r2(by - BASE_HALF * py)}`,
  ].join(' ');
}

export interface RotaryDialProps {
  /** 0..100 fill position of the pointer. */
  value: number;
  /** Displayed number (defaults to the rounded value). Ignored if hideNumber. */
  displayValue?: string;
  /** Show the recessed dash instead of a number (empty state). */
  hideNumber?: boolean;
  /** Rendered pixel size (width = height). */
  size?: number;
  /**
   * Play a car-dashboard style startup sweep on mount: the pointer & ticks
   * race from 0 → 100 and settle back on the real value, and the center
   * number counts along. Off by default.
   */
  animateOnMount?: boolean;
  /** Stagger the sweep start (ms) so a row of dials fires in sequence. */
  animateDelay?: number;
}

// Sweep timings (ms) — like an instrument cluster self-test:
// 0 → 100 (rev up), hold at the top, 100 → 0 (drop back), hold at zero,
// then settle on the real value.
const SWEEP_UP = 850; // 0 → 100
const SWEEP_HOLD = 320; // pause at the top
const SWEEP_DOWN = 750; // 100 → 0
const SWEEP_HOLD_ZERO = 1000; // pause at zero before settling
const SWEEP_SETTLE = 780; // 0 → real value
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function RotaryDial({
  value,
  displayValue,
  hideNumber = false,
  size = 120,
  animateOnMount = false,
  animateDelay = 0,
}: RotaryDialProps) {
  const target = Math.max(0, Math.min(100, value));
  const reduceMotion = useReduceMotion();

  // Live percentage that everything renders from. During the intro sweep it
  // is driven by rAF; afterwards it just tracks the real value.
  const [pct, setPct] = useState(animateOnMount && !reduceMotion ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const didIntro = useRef(false);

  useEffect(() => {
    if (!animateOnMount || reduceMotion || didIntro.current) {
      setPct(target);
      return;
    }
    didIntro.current = true;
    const startAt = Date.now() + animateDelay;
    const tDown = SWEEP_UP + SWEEP_HOLD;
    const tZero = tDown + SWEEP_DOWN;
    const tSettle = tZero + SWEEP_HOLD_ZERO;
    const total = tSettle + SWEEP_SETTLE;

    const tick = () => {
      const elapsed = Date.now() - startAt;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      let next: number;
      if (elapsed < SWEEP_UP) {
        // Rev up: 0 → 100
        next = 100 * easeOut(elapsed / SWEEP_UP);
      } else if (elapsed < tDown) {
        // Hold at the top
        next = 100;
      } else if (elapsed < tZero) {
        // Drop back: 100 → 0
        const p = (elapsed - tDown) / SWEEP_DOWN;
        next = 100 * (1 - easeInOut(p));
      } else if (elapsed < tSettle) {
        // Hold at zero
        next = 0;
      } else if (elapsed < total) {
        // Settle: 0 → real value
        const p = (elapsed - tSettle) / SWEEP_SETTLE;
        next = target * easeOut(p);
      } else {
        setPct(target);
        rafRef.current = null;
        return;
      }
      setPct(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // Only run the intro once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After the intro, keep tracking external value changes.
  useEffect(() => {
    if (didIntro.current && rafRef.current == null) setPct(target);
  }, [target]);

  const frac = pct / 100;
  const pointer = useMemo(() => buildPointer(pct), [pct]);
  const shown = displayValue ?? String(Math.round(pct));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <Defs>
          <RadialGradient id="rd-face" cx="42%" cy="37%" r="75%">
            <Stop offset="0%" stopColor="#fefdfc" />
            <Stop offset="55%" stopColor="#f7f5f2" />
            <Stop offset="100%" stopColor="#edeae6" />
          </RadialGradient>
          <RadialGradient id="rd-inner" cx="45%" cy="40%" r="72%">
            <Stop offset="0%" stopColor="#fdfcfa" />
            <Stop offset="100%" stopColor="#f2f0ec" />
          </RadialGradient>
          <RadialGradient id="rd-sheen" cx="37%" cy="31%" r="54%">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.7} />
            <Stop offset="62%" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="rd-rim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ffffff" />
            <Stop offset="100%" stopColor="#e5e2dd" />
          </LinearGradient>
          <LinearGradient id="rd-innerrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#d5d0c9" />
            <Stop offset="100%" stopColor="#ffffff" />
          </LinearGradient>
        </Defs>

        {/* Outer face + rim */}
        <Circle
          cx={CX}
          cy={CY}
          r={R_FACE}
          fill="url(#rd-face)"
          stroke="url(#rd-rim)"
          strokeWidth={1.5}
        />
        {/* Top-left sheen */}
        <Circle cx={CX} cy={CY} r={R_FACE} fill="url(#rd-sheen)" />
        {/* Recessed inner disc */}
        <Circle cx={CX} cy={CY} r={R_INNER} fill="url(#rd-inner)" />
        <Circle
          cx={CX}
          cy={CY}
          r={R_INNER}
          fill="none"
          stroke="url(#rd-innerrim)"
          strokeWidth={2}
          strokeOpacity={0.45}
        />

        {/* Colored tick ring — ticks up to the value light up vividly,
            the rest stay in the soft resting tone. */}
        {TICKS.map((t, i) => {
          const on = !hideNumber && pct > 0 && t.f <= frac + 1e-6;
          return (
            <Line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={on ? t.active : t.idle}
              strokeOpacity={on ? 1 : t.op}
              strokeWidth={on ? TICK_W_ACTIVE : TICK_W_IDLE}
              strokeLinecap="round"
            />
          );
        })}

        {/* Teal pointer */}
        <Polygon points={pointer} fill={POINTER_COLOR} />

        {/* Empty-state dash */}
        {hideNumber ? (
          <Rect x={519} y={598} width={217} height={18} rx={9} fill="#c9c7ce" />
        ) : null}

        {/* Scale labels */}
        {/* 0 and 100 rendered as RN Text below for crisp font rendering */}
      </Svg>

      {/* Centered value (skip when showing the dash). Large and prominent
          — the number is the primary read, like Apple Health. Long values
          (e.g. "100g") auto-shrink so they never overflow the face. */}
      {!hideNumber ? (
        <View pointerEvents="none" style={styles.center}>
          <Text
            style={[styles.value, { fontSize: size * 0.26 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {shown}
          </Text>
        </View>
      ) : null}

      {/* 0 / 100 labels, centered on the source anchor points
          (x≈341/1254=27.2%, x≈912/1254=72.7%, baseline y≈1014/1254=80.9%,
          font-size 60/1254≈4.8%). */}
      <Text
        style={[
          styles.scaleLabel,
          {
            left: size * 0.272 - size * 0.15,
            width: size * 0.3,
            top: size * 0.75,
            fontSize: size * 0.048,
          },
        ]}
      >
        0
      </Text>
      <Text
        style={[
          styles.scaleLabel,
          {
            left: size * 0.727 - size * 0.15,
            width: size * 0.3,
            top: size * 0.75,
            fontSize: size * 0.048,
          },
        ]}
      >
        100
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // Match the source: value sits at ~47.4% vertically
    paddingBottom: '5.2%',
  },
  value: {
    color: '#2e3440',
    fontWeight: '600',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  scaleLabel: {
    position: 'absolute',
    color: '#b6bac1',
    fontWeight: '500',
    textAlign: 'center',
  },
});
