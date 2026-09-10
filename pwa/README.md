# Shared PWA Helpers

This directory contains helper files for the small music-tool apps in sibling directories. Each tool directory is expected to be its own installable PWA.

Example layout:

```text
music-tools/
  pwa/
    README.md
    update-pwa.js
    sw.js
    sw-common.js
  sight-reading/
    index.html
    manifest.json
    icon.svg
    sw.js
  fm-1-seq/
    index.html
    manifest.json
    icon.svg
    sw.js
```

## Files In This Directory

- `update-pwa.js`: reusable browser-side update checker and service worker registration helper.
- `sw.js`: reference local service worker wrapper. Copy this into an app directory and edit its app-specific cache config.
- `sw-common.js`: shared install, activate, fetch, cache cleanup, and offline fallback behavior imported by each local `sw.js`.

## Creating A New PWA Tool

1. Create a new sibling directory under `music-tools/`.

   ```text
   music-tools/my-tool/
   ```

2. Add the app files:

   ```text
   music-tools/my-tool/index.html
   music-tools/my-tool/manifest.json
   music-tools/my-tool/icon.svg
   music-tools/my-tool/sw.js
   ```

3. Copy the reference service worker into the app directory:

   ```sh
   cp ../pwa/sw.js my-tool/sw.js
   ```

4. Edit `my-tool/sw.js`:

   - Change `PWA_CACHE_NAME` to an app-specific name, for example `my-tool-v1`.
   - Make sure `PWA_URLS_TO_CACHE` contains every file needed for first-load offline use.
   - Keep `importScripts('../pwa/sw-common.js')` so the local worker uses the shared behavior.
   - Bump `PWA_CACHE_NAME` when cached files change and you want old caches removed.

5. Add a manifest link and theme color to `index.html`:

   ```html
   <link rel="manifest" href="manifest.json" />
   <meta name="theme-color" content="#16213e" />
   ```

6. Add the update helper to `index.html`.

   The helper lives in the adjacent shared `pwa` directory:

   ```html
   <script>
   window.PWA_UPDATE_CONFIG = {
     serviceWorkerUrl: 'sw.js',
     updateUrl: 'https://wasm.neocities.org/my-tool/',
     storageKey: 'my-tool-update-hash',
     autoCheck: true
   };
   </script>
   <script src="../pwa/update-pwa.js"></script>
   ```

7. Add the reusable manual update button web component where the UI should show it:

   ```html
   <pwa-check-update></pwa-check-update>
   ```

   Optional label override:

   ```html
   <pwa-check-update label="Update"></pwa-check-update>
   ```

   The web component is registered by `../pwa/update-pwa.js`. Use this instead of hand-wiring a `checkUpdateBtn` in every app.

   The component shows `Install` when the app is running in a normal browser tab. Clicking it opens OS/browser-specific install instructions and explains that the installed app will be available offline. When the app is running standalone as an installed PWA, the same component shows `Check Update` and runs the update check.

## Manifest Requirements

Each app needs its own `manifest.json`. Minimal example:

```json
{
  "name": "My Music Tool",
  "short_name": "MyTool",
  "description": "A small installable music tool.",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#16213e",
  "icons": [
    {
      "src": "icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
```

## Offline Requirements

For offline use, the app directory must contain all files the app needs to run:

- `index.html`
- `manifest.json`
- icon files referenced by the manifest
- CSS files, if any
- JavaScript files, if any
- audio, images, fonts, WASM, or data files needed on first load
- a local `sw.js` with those files listed in `PWA_URLS_TO_CACHE`

Avoid depending on cross-origin files for core app startup. The service worker can only reliably precache and serve files available under the app's origin.

## Service Worker Scope

Registering this shared file directly:

```js
serviceWorkerUrl: '../pwa/sw.js'
```

is usually not what a sibling app wants. Browsers scope service workers to the directory they are served from, so `../pwa/sw.js` will normally control the `/pwa/` path, not `/my-tool/`.

For each installable sibling app, prefer a local wrapper:

```text
music-tools/my-tool/sw.js
```

and configure:

```js
serviceWorkerUrl: 'sw.js'
```

That local worker can still reuse shared code with:

```js
importScripts('../pwa/sw-common.js');
```

## Update Check Behavior

`update-pwa.js` checks a remote URL, hashes the returned HTML, and compares it with the hash stored in `localStorage`.

Config fields:

- `serviceWorkerUrl`: service worker path relative to the app page.
- `updateUrl`: canonical online URL for this specific app.
- `storageKey`: app-specific localStorage key for the saved hash.
- `updateButtonId`: optional legacy button id for manual checks. Prefer `<pwa-check-update>`.
- `autoCheck`: whether to silently check on page load.

When a new hash is found, the helper asks the user whether to update. If they accept, it clears caches, unregisters service workers, and reloads the page.
