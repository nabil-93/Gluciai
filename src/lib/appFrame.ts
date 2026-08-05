import { Platform, useWindowDimensions } from 'react-native';

/**
 * On a phone the browser *is* the app: it fills the screen and everything the
 * layout measures — `useWindowDimensions`, `measureInWindow` — is the truth.
 *
 * On a desktop the same page stretched edge to edge, which is not what this
 * app was drawn for. So on a wide viewport the app becomes a phone-shaped
 * column standing in the middle of the page (the column itself is drawn in
 * CSS — see `app/+html.tsx`).
 *
 * That splits the two coordinate systems apart: the window is 1900px wide, the
 * app is 430. The constants below are the *same numbers* the stylesheet uses,
 * so the handful of screens that measure the window can ask for the column
 * instead and agree with what the patient actually sees.
 *
 * Change one side and you must change the other.
 */

/** Width of the column, in CSS pixels. */
export const FRAME_W = 430;
/** Tallest the column ever gets, so a big monitor doesn't stretch it. */
export const FRAME_MAX_H = 932;
/** Breathing room kept above and below the column, total. */
export const FRAME_GUTTER_H = 24;
/** Under this viewport width there is no column — the app fills the page. */
export const FRAME_MIN_VIEWPORT_W = 600;
/** Nor under this height: a phone turned sideways is wide but short, and it
 *  should still use every pixel it has. */
export const FRAME_MIN_VIEWPORT_H = 500;

/** True when the app is drawn as a column inside a wider page. */
export function isFramed(viewportW: number, viewportH: number): boolean {
  return (
    Platform.OS === 'web' &&
    viewportW >= FRAME_MIN_VIEWPORT_W &&
    viewportH >= FRAME_MIN_VIEWPORT_H
  );
}

/** The size of the surface the app is actually drawn on. */
export function frameSize(
  viewportW: number,
  viewportH: number
): { width: number; height: number } {
  if (!isFramed(viewportW, viewportH)) return { width: viewportW, height: viewportH };
  return {
    width: FRAME_W,
    height: Math.min(viewportH - FRAME_GUTTER_H, FRAME_MAX_H),
  };
}

/**
 * Where the column sits inside the page. Subtract these from a
 * `measureInWindow` result to turn a browser coordinate into an app one.
 */
export function frameOffset(
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const { width, height } = frameSize(viewportW, viewportH);
  return { x: (viewportW - width) / 2, y: (viewportH - height) / 2 };
}

/**
 * `useWindowDimensions` for screens that size themselves against the whole
 * surface. Identical to it on a phone; on a desktop it reports the column.
 */
export function useFrameDimensions(): {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
} {
  const { width: viewportW, height: viewportH } = useWindowDimensions();
  const { width, height } = frameSize(viewportW, viewportH);
  const { x, y } = frameOffset(viewportW, viewportH);
  return { width, height, offsetX: x, offsetY: y };
}
