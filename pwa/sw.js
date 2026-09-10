// Reference local service worker for a music-tools PWA.
// Copy this file into an app directory and edit the app-specific config.

self.PWA_CACHE_NAME = 'my-tool-v1';
self.PWA_URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];
self.PWA_FALLBACK_URL = './index.html';

importScripts('../pwa/sw-common.js');
