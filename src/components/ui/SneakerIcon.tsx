import React from 'react';
import Svg, { Ellipse, Path } from 'react-native-svg';

/**
 * Sneaker illustration drawn in SVG — white body + green accents,
 * transparent by nature (no image box), matching the design board.
 * Replaces the emoji which rendered off-color across platforms.
 */
export function SneakerIcon({ size = 96 }: { size?: number }) {
  const w = size;
  const h = size * 0.72;
  return (
    <Svg width={w} height={h} viewBox="0 0 130 94">
      {/* Ground shadow */}
      <Ellipse cx={66} cy={86} rx={52} ry={6} fill="rgba(25,150,95,0.14)" />

      {/* Green sole */}
      <Path
        d="M8 74c-2-7 2-11 10-12l96-6c8 0 12 4 12 10 0 7-5 11-13 11H22c-8 0-12-1-14-3z"
        fill="#19c37d"
      />
      <Path
        d="M8 74c-2-7 2-11 10-12l96-6c3 0 5 .5 7 1.5-2-.3-4-.5-7-.3L18 63c-8 1-12 5-10 11z"
        fill="#3ddb98"
      />

      {/* White upper body */}
      <Path
        d="M18 62C22 40 34 26 52 20c10-3 16-2 22 3l8 7c4 3 9 5 15 6 10 2 16 8 17 17 .5 5-2 8-8 8l-88 5c-6 0-11-3-11-9z"
        fill="#ffffff"
      />
      {/* Soft body shading */}
      <Path
        d="M18 62C22 42 33 28 50 21c-9 8-16 20-19 36-.5 4 1 6 5 6l-7 .5c-6 0-11-2-11-1.5z"
        fill="#eef4f1"
      />

      {/* Green heel */}
      <Path
        d="M100 40c8 1 14 6 16 14 1 5-2 8-8 8l-16 1c-2-9-1-17 8-23z"
        fill="#19c37d"
      />
      {/* Green toe cap */}
      <Path
        d="M52 20c8-2 14-1 19 4-9-1-18 1-26 7 1-5 3-9 7-11z"
        fill="#2fce8b"
      />

      {/* Laces */}
      <Path
        d="M58 30l16 5M56 37l17 4M55 44l17 3"
        stroke="#19c37d"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      {/* Tongue top */}
      <Path
        d="M60 25c5-2 10-1 14 2"
        stroke="#c9f0dd"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
