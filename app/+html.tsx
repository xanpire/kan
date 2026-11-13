import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { APP_VERSION } from '@/lib/version';

// The same ?v= the service worker precaches (scripts/generate-sw.js).
const v = `?v=${APP_VERSION}`;

const pageStyles = `
  html, body {
    background-color: #050505;
    color-scheme: dark;
  }
  body {
    margin: 0;
    overscroll-behavior-y: none;
    -webkit-font-smoothing: antialiased;
  }
  #root {
    min-height: 100%;
    background-color: #050505;
  }
  * {
    -webkit-tap-highlight-color: transparent;
  }
  /* App text is not selectable, so a long press on the phone never grabs
     words. Only fields you type in (your action, settings, names) can be
     selected and edited. */
  body, body * {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  input, textarea, [contenteditable="true"] {
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
  }
  ::selection {
    background: #E50914;
    color: #FFFFFF;
  }
`;

const serviceWorker = `
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          content="width=device-width, initial-scale=1, viewport-fit=cover"
          name="viewport"
        />
        <title>Kan — Interactive Naruto RPG</title>
        <meta
          content="A single-page PWA where you play Kan, an original shinobi in the Naruto universe."
          name="description"
        />
        <meta content="#050505" name="theme-color" />
        <meta content="yes" name="mobile-web-app-capable" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="black-translucent" name="apple-mobile-web-app-status-bar-style" />
        <meta content="Kan" name="apple-mobile-web-app-title" />
        <link href={`/manifest.webmanifest${v}`} rel="manifest" />
        <link href={`/apple-touch-icon.png${v}`} rel="apple-touch-icon" sizes="180x180" />
        <link href={`/icon-192.png${v}`} rel="icon" sizes="192x192" type="image/png" />
        <link href={`/icon-512.png${v}`} rel="icon" sizes="512x512" type="image/png" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: serviceWorker }} />
      </body>
    </html>
  );
}
