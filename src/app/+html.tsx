import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web-only root HTML document (used by Expo Router's static export).
 * Adds `viewport-fit=cover` + safe-area padding so the app respects the
 * phone's notch and the browser's top/bottom bars — otherwise the header
 * and tab bar get clipped behind the browser chrome.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* initial-scale keeps the layout at native size and reflows to fill
            the width. maximum-scale=1 + user-scalable=no KILL the iOS/Safari
            auto-zoom that fires when a small-font input is focused (the
            keyboard-opens-and-zooms bug on the "Add to Home Screen" PWA) and
            also disable pinch-zoom entirely, so the app never zooms. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#19c37d" />

        {/* PWA — lets iOS/Android "Add to Home Screen" open the app
            standalone (full screen, no Safari address/toolbar). */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <meta name="apple-mobile-web-app-title" content="GlucoAI" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/icon-192.png" />

        {/* Reset ScrollView so vertical content scrolls on web. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// The app's UI was drawn at oversized proportions; on a real phone it looks
// too large. CSS `zoom` shrinks every element AND reflows the layout, so the
// content still fills the full screen width — just at a smaller, native-
// feeling size. Supported on iOS Safari 16+ and Chrome; older engines simply
// ignore it and fall back to full size (no breakage).
const responsiveBackground = `
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #f9fafe;
  overflow: hidden;
  /* Kill double-tap-to-zoom (leaves taps/scroll working). Together with the
     viewport maximum-scale=1 this removes every kind of zoom on the PWA. */
  touch-action: manipulation;
}
#root {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  /* Safe-area padding so nothing hides behind the notch / browser bars.
     Cap the bottom inset so it doesn't leave a big empty gap under the
     content — the home-indicator area only needs a few px. */
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: min(env(safe-area-inset-bottom, 0px), 8px);
  box-sizing: border-box;
}
/* Make sure the app's top-level views fill the full width (no centered
   column leaving grey gaps on the sides). */
#root > * {
  width: 100%;
  flex: 1 1 auto;
}
@media (prefers-color-scheme: dark) {
  body { background-color: #f9fafe; }
}
/* Remove the browser's default blue focus ring on inputs and pressables.
   The app draws its own focus feedback (border colour / background), so the
   hard blue rectangle around a focused field is unwanted on every screen —
   including the value inputs and the login email/password fields. */
* { -webkit-tap-highlight-color: transparent; }
input, textarea, select, button,
[contenteditable], [role="button"], [tabindex] { outline: none !important; }
input:focus, textarea:focus, select:focus, button:focus,
[contenteditable]:focus, [role="button"]:focus, [tabindex]:focus,
a:focus, :focus, :focus-visible { outline: none !important; }
`;
