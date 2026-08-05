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
        <meta name="apple-mobile-web-app-title" content="GluciAI" />
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
:root {
  /* Geometry of the app surface. On a phone it is the whole viewport; the
     desktop rule further down turns it into a centred phone-shaped column.
     These numbers are mirrored in lib/appFrame.ts — keep the two in step. */
  --vh: 100vh;
  --frame-w: 100%;
  --frame-h: var(--vh);
  --frame-r: 0px;
}
@supports (height: 100dvh) { :root { --vh: 100dvh; } }
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: var(--vh);
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
  width: var(--frame-w);
  height: var(--frame-h);
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

/* ── Desktop: the app is a phone, not a page ─────────────────────────────
   This UI was drawn for a 390–430px screen. Let loose on a 1900px monitor
   every row stretches into a band and the design falls apart. So above a
   tablet's width the app stops being the page and becomes a phone standing
   on it: the same column the patient sees in their hand, centred, with the
   rest of the window as the wall behind it.

   The height condition is what keeps a real phone out of this: turned
   sideways it is wide too, but only ~400px tall, and it should still use
   every pixel it has. */
@media (min-width: 600px) and (min-height: 500px) {
  :root {
    --frame-w: 430px;
    /* Never taller than a large phone, and always a little air top and
       bottom so the rounded corners read as a device edge. */
    --frame-h: min(calc(var(--vh) - 24px), 932px);
    --frame-r: 30px;
  }
  body {
    height: var(--vh);
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(120% 80% at 50% -10%, #eaf7f1 0%, rgba(234,247,241,0) 60%),
      radial-gradient(90% 60% at 50% 110%, #eef0fa 0%, rgba(238,240,250,0) 55%),
      #e9ecf3;
  }
  #root {
    flex: 0 0 auto;
    border-radius: var(--frame-r);
    overflow: hidden;
    background-color: #f9fafe;
    box-shadow:
      0 1px 2px rgba(17, 24, 39, 0.06),
      0 24px 70px -12px rgba(17, 24, 39, 0.28);
  }
  /* react-native-web renders every <Modal> into its own <div> appended to
     <body>, and the modal inside it is \`position: fixed; inset: 0\` — which
     would cover the whole browser instead of the phone. A transform on the
     portal makes it the containing block for that fixed child, so the modal
     lands on the phone and gets clipped to it. Portals also exist for every
     mounted-but-hidden Modal, hence pointer-events: those empty boxes must
     not swallow taps meant for the screen underneath. */
  body > div:not(#root) {
    position: fixed;
    top: 50%;
    left: 50%;
    width: var(--frame-w);
    height: var(--frame-h);
    transform: translate(-50%, -50%);
    border-radius: var(--frame-r);
    overflow: hidden;
    pointer-events: none;
  }
  body > div:not(#root) > * { pointer-events: auto; }
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
