self.PWA_CACHE_NAME = 'scales-planner-v24';
self.PWA_URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg'
];
self.PWA_FALLBACK_URL = './index.html';

importScripts('../pwa/sw-common.js?v=2');
