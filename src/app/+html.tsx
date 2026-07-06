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
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
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

// Full-height layout + honor the device safe areas (notch, browser bars).
// Uses 100dvh (dynamic viewport height) so the app fills exactly the space
// left by iOS Safari's collapsing address/tool bars — 100vh over-reports
// and pushes content behind them.
const responsiveBackground = `
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #E4E4E9;
  overflow: hidden;
}
#root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  /* Pad by the device safe-area insets so nothing hides behind the
     notch or the browser's top/bottom chrome. */
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
}
@media (prefers-color-scheme: dark) {
  body { background-color: #E4E4E9; }
}
`;
