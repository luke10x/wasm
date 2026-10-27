self.PWA_CACHE_NAME = 'chord-helper-v6';
self.PWA_URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];
self.PWA_FALLBACK_URL = './index.html';

importScripts('../pwa/sw-common.js?v=2');
