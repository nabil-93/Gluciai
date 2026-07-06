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
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
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
        <script dangerouslySetInnerHTML={{ __html: viewportScale }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

// Full-height layout + honor the device safe areas (notch, browser bars).
// The app was designed at a 390px reference width. We render it inside a
// fixed 390px column and scale that column with CSS transform to exactly
// fill the device width — so on any phone the UI keeps its intended size
// and proportions instead of stretching oversized on wider screens.
const DESIGN_W = 390;
const responsiveBackground = `
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #f9fafe;
  overflow: hidden;
}
#root {
  position: fixed;
  top: 0;
  left: 50%;
  width: ${DESIGN_W}px;
  height: 100vh;
  height: 100dvh;
  /* Scale set by JS; origin top-center so the column stays centered and
     pinned to the top. */
  transform-origin: top center;
  will-change: transform;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* Safe-area padding lives here so it scales with the app. */
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  body { background-color: #f9fafe; }
}
`;

// Scale the fixed 390px root to the viewport width, but NEVER above 1x —
// so the app renders at its designed size (or smaller on tiny screens) and
// never zooms up to look oversized on wide phones. Height is counter-scaled
// so the scaled column still covers the full visual viewport.
const viewportScale = `
(function () {
  var DESIGN = ${DESIGN_W};
  function apply() {
    var root = document.getElementById('root');
    if (!root) return;
    var vw = window.innerWidth || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var scale = Math.min(vw / DESIGN, 1);
    root.style.height = (vh / scale) + 'px';
    root.style.transform = 'translateX(-50%) scale(' + scale + ')';
  }
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', apply);
  }
  // Re-apply after fonts/layout settle.
  setTimeout(apply, 60);
  setTimeout(apply, 300);
})();
`;
