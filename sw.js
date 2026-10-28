// Ad Legem — service worker: deixa o app funcionando offline.
// Ao publicar mudanças, aumente VERSION (ad-legem-v5, v5…) para limpar o cache antigo.
const VERSION = 'ad-legem-v5';
const CORE = [
  './', './index.html', './styles.css', './app.js', './perguntas.js', './data.json', './manifest.webmanifest',
  './seal.svg', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './fonts/ebgaramond.woff2', './fonts/ebgaramond-italic.woff2', './fonts/forum.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Responde com a cópia salva na hora e atualiza o cache em segundo plano.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit || Response.error());
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
