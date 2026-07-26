import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/* ────────────────────────────────────────────────────────────
 * ACTION GLYPHS — the icon set for the "+" menu.
 *
 * Same language as the tab bar: ONE solid filled shape per idea, drawn on a
 * 24 grid, with detail knocked OUT in the surface colour rather than added
 * as a second stroke. Filled marks hold their weight at 20 px on a phone;
 * thin outlines go grey and vanish, which is why the emoji and the
 * hairline pictograms they replace read as tired.
 *
 * Every glyph takes the destination's own colour, so the menu is a set of
 * coloured marks rather than fifteen identical circles.
 * ──────────────────────────────────────────────────────────── */

export type ActionGlyphName =
  | 'scan'
  | 'glucose'
  | 'insulin'
  | 'bolus'
  | 'tagine'
  | 'salad'
  | 'target'
  | 'globe'
  | 'barcode'
  | 'menu'
  | 'flask'
  | 'report'
  | 'sos';

interface Props {
  name: ActionGlyphName;
  color: string;
  size?: number;
  /** The colour detail is knocked out in — the surface behind the glyph. */
  knockout?: string;
}

export function ActionGlyph({ name, color, size = 22, knockout = '#FFFFFF' }: Props) {
  const s = { width: size, height: size, viewBox: '0 0 24 24' };
  const K = knockout;

  switch (name) {
    /* A camera, because the copy asks for a photo. Lens knocked out so the
       mark still reads as a camera at 20 px, where an outline would not. */
    case 'scan':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M9.1 2.6h5.8a2 2 0 0 1 1.8 1.1l.6 1.2h1.8A4 4 0 0 1 22.1 8.9v8.5a4 4 0 0 1-4 4H5.9a4 4 0 0 1-4-4V8.9a4 4 0 0 1 4-4h1.8l.6-1.2a2 2 0 0 1 1.8-1.1Z"
          />
          <Circle cx={12} cy={13.2} r={4.5} fill={K} />
          <Circle cx={12} cy={13.2} r={2.3} fill={color} />
          <Circle cx={18.6} cy={8.9} r={1} fill={K} />
        </Svg>
      );

    /* A blood drop, with the light catching its shoulder. */
    case 'glucose':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M12 2.2c1.1 1.2 7 7.7 7 11.7a7 7 0 1 1-14 0c0-4 5.9-10.5 7-11.7Z"
          />
          <Ellipse cx={9.1} cy={13.4} rx={1.5} ry={2.3} fill={K} opacity={0.85} transform="rotate(-20 9.1 13.4)" />
        </Svg>
      );

    /* A loaded syringe on the diagonal — barrel, graduations, needle. */
    case 'insulin':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M13.9 3.6a1.3 1.3 0 0 1 1.9 0l4.6 4.6a1.3 1.3 0 0 1-1.9 1.9l-.7-.7-1.4 1.4 1 1a1.2 1.2 0 0 1-1.7 1.7l-1-1-5.4 5.4-3.9 1 1-3.9 5.4-5.4-1-1a1.2 1.2 0 0 1 1.7-1.7l1 1L14.9 6l-.7-.7a1.3 1.3 0 0 1-.3-1.7Z"
          />
          <Rect x={12.6} y={9.4} width={4.6} height={1.4} rx={0.7} fill={K} transform="rotate(-45 12.6 9.4)" />
          <Rect x={10.2} y={11.8} width={3.4} height={1.4} rx={0.7} fill={K} transform="rotate(-45 10.2 11.8)" />
        </Svg>
      );

    /* A calculator: screen and keys knocked out of a solid body. */
    case 'bolus':
      return (
        <Svg {...s}>
          <Rect x={3.6} y={2.4} width={16.8} height={19.2} rx={4} fill={color} />
          <Rect x={6.2} y={5} width={11.6} height={4} rx={1.6} fill={K} />
          <Circle cx={8} cy={12.6} r={1.35} fill={K} />
          <Circle cx={12} cy={12.6} r={1.35} fill={K} />
          <Circle cx={16} cy={12.6} r={1.35} fill={K} />
          <Circle cx={8} cy={17.2} r={1.35} fill={K} />
          <Circle cx={12} cy={17.2} r={1.35} fill={K} />
          <Rect x={14.65} y={15.85} width={2.7} height={2.7} rx={1.2} fill={K} />
        </Svg>
      );

    /* A tagine — the lid, the dish, and the little handle on top. */
    case 'tagine':
      return (
        <Svg {...s}>
          <Circle cx={12} cy={3.4} r={1.5} fill={color} />
          <Path fill={color} d="M3.9 14.4a8.1 8.1 0 0 1 16.2 0Z" />
          <Rect x={2.4} y={15.6} width={19.2} height={3.4} rx={1.7} fill={color} />
          <Rect x={7.4} y={11.4} width={9.2} height={1.5} rx={0.75} fill={K} opacity={0.8} />
        </Svg>
      );

    /* A bowl of greens: the leaf reads before the bowl does. */
    case 'salad':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M12.7 3c3 .5 5 2.6 5.2 5.6-3-.4-5-2.5-5.2-5.6Zm-1.6 2.2c.3 2.3-.8 4.2-3 5.1-.3-2.3.8-4.2 3-5.1Z"
          />
          <Path fill={color} d="M2.8 12.2h18.4a9.2 9.2 0 0 1-18.4 0Z" />
          <Rect x={6.4} y={14.4} width={5} height={1.5} rx={0.75} fill={K} opacity={0.75} />
        </Svg>
      );

    /* A target: two rings and the centre, all knocked out of one disc. */
    case 'target':
      return (
        <Svg {...s}>
          <Circle cx={12} cy={12} r={9.4} fill={color} />
          <Circle cx={12} cy={12} r={6.3} fill={K} />
          <Circle cx={12} cy={12} r={4} fill={color} />
          <Circle cx={12} cy={12} r={1.7} fill={K} />
        </Svg>
      );

    /* A globe: meridians and the equator knocked out of the sphere. */
    case 'globe':
      return (
        <Svg {...s}>
          <Circle cx={12} cy={12} r={9.4} fill={color} />
          <Rect x={2.9} y={11.15} width={18.2} height={1.7} rx={0.85} fill={K} />
          <Path
            fill={K}
            d="M12 2.6c2.3 2.4 3.6 5.7 3.6 9.4S14.3 19 12 21.4c-2.3-2.4-3.6-5.7-3.6-9.4S9.7 5 12 2.6Zm0 3.3c-1.2 1.8-1.9 4-1.9 6.1s.7 4.3 1.9 6.1c1.2-1.8 1.9-4 1.9-6.1s-.7-4.3-1.9-6.1Z"
          />
        </Svg>
      );

    /* A barcode: the bars themselves, no decorative frame. */
    case 'barcode':
      return (
        <Svg {...s}>
          <Rect x={2.6} y={4.4} width={2.6} height={15.2} rx={1.1} fill={color} />
          <Rect x={6.6} y={4.4} width={1.5} height={15.2} rx={0.75} fill={color} />
          <Rect x={9.5} y={4.4} width={3.1} height={15.2} rx={1.2} fill={color} />
          <Rect x={14} y={4.4} width={1.5} height={15.2} rx={0.75} fill={color} />
          <Rect x={16.9} y={4.4} width={2.2} height={15.2} rx={1} fill={color} />
          <Rect x={20.5} y={4.4} width={1.5} height={15.2} rx={0.75} fill={color} />
        </Svg>
      );

    /* A restaurant menu: cutlery knocked into the card, so it never reads as
       the medical report sitting two rows below it. */
    case 'menu':
      return (
        <Svg {...s}>
          <Rect x={3.6} y={2.4} width={16.8} height={19.2} rx={4} fill={color} />
          <Rect x={7.4} y={6.2} width={3} height={11.6} rx={1.5} fill={K} />
          <Rect x={6.1} y={6.2} width={1.5} height={5.2} rx={0.75} fill={K} />
          <Rect x={10.2} y={6.2} width={1.5} height={5.2} rx={0.75} fill={K} />
          <Path
            fill={K}
            d="M15.4 6.2c1.6 0 2.6 1.6 2.6 3.6 0 1.5-.6 2.6-1.5 3.1v4.9a1.5 1.5 0 0 1-3 0V6.9c0-.4.3-.7.7-.7Z"
          />
        </Svg>
      );

    /* An Erlenmeyer flask with the liquid line showing. */
    case 'flask':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M9.2 2.4h5.6a1.2 1.2 0 0 1 0 2.4h-.3v4.3l5 8.6a3 3 0 0 1-2.6 4.5H7.1a3 3 0 0 1-2.6-4.5l5-8.6V4.8h-.3a1.2 1.2 0 0 1 0-2.4Z"
          />
          <Rect x={6.5} y={14.2} width={11} height={1.6} rx={0.8} fill={K} opacity={0.85} />
          <Circle cx={10.2} cy={17.9} r={1.15} fill={K} opacity={0.85} />
          <Circle cx={13.8} cy={18.6} r={0.85} fill={K} opacity={0.85} />
        </Svg>
      );

    /* A report, corner turned down. */
    case 'report':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M5.4 4.4A2.8 2.8 0 0 1 8.2 1.6h5.5l6.3 6.3v11.7a2.8 2.8 0 0 1-2.8 2.8H8.2a2.8 2.8 0 0 1-2.8-2.8V4.4Z"
          />
          <Path fill={K} opacity={0.9} d="M13.7 1.6 20 7.9h-4.5a1.8 1.8 0 0 1-1.8-1.8V1.6Z" />
          <Rect x={8.2} y={11.4} width={7.6} height={1.7} rx={0.85} fill={K} />
          <Rect x={8.2} y={15} width={5.4} height={1.7} rx={0.85} fill={K} />
        </Svg>
      );

    /* A shield with a medical cross — protection, not alarm. */
    case 'sos':
      return (
        <Svg {...s}>
          <Path
            fill={color}
            d="M12 1.8 20.3 5v6.3c0 5.3-3.4 9.8-8.3 11.3-4.9-1.5-8.3-6-8.3-11.3V5L12 1.8Z"
          />
          <Rect x={10.4} y={6.6} width={3.2} height={9.4} rx={1.6} fill={K} />
          <Rect x={6.6} y={10.4} width={10.8} height={3.2} rx={1.6} fill={K} />
        </Svg>
      );
  }
}
