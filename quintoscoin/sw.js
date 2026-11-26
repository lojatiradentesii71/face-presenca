/* QuintosCoin PWA — Passo 447
 * Escopo restrito a /quintoscoin/ pelo registro ./sw.js, scope ./.
 * Política: NUNCA armazenar HTML financeiro, JavaScript, CSS, fichas ou
 * respostas de API no CacheStorage. Somente a página informativa offline.
 * Não tocar nos caches de outros sistemas hospedados no mesmo GitHub Pages.
 */
'use strict';
const QC_OFFLINE_CACHE = 'qc-pwa-offline-v447';
const QC_CACHE_PREFIX = 'qc-pwa-offline-';
const QC_OFFLINE_URL = new URL('./offline.html', self.registration.scope).href;
const QC_SCOPE_PATH = new URL(self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(QC_OFFLINE_CACHE);
    await cache.add(new Request(QC_OFFLINE_URL, {cache: 'reload'}));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(QC_CACHE_PREFIX) && k !== QC_OFFLINE_CACHE)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(QC_SCOPE_PATH)) {
    // Requisições a Apps Script, APIs e outros projetos: não interceptar.
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // HTML sempre pela rede; nunca mostrar tela financeira antiga offline.
        return await fetch(req, {cache: 'no-store'});
      } catch (_) {
        const cache = await caches.open(QC_OFFLINE_CACHE);
        return (await cache.match(QC_OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }
  if (req.destination === 'script' || req.destination === 'style') {
    // JS/CSS financeiros sempre obtidos pela rede; sem cache e sem fallback.
    event.respondWith(fetch(req, {cache: 'no-store'}));
  }
});
