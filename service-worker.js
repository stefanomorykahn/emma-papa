/* ============================================================
   service-worker.js  ·  Emma & Papá
   Cache básico para que la app funcione sin internet (offline).
   Estrategia: "cache first" para los archivos de la app.
   Cambia CACHE_VERSION cuando actualices el código.
   ============================================================ */
const CACHE_VERSION = 'emma-v17';
const ARCHIVOS = [
  './',
  'index.html',
  'emma-perfil.html',
  'emma-diario.html',
  'storage.js',
  'notes.js',
  'profile.js',
  'seed.js',
  'activities-bank.js',
  'supabase-config.js',
  'supabase-sync.js',
  'ai.js',
  'photos.js',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

// Instalar: precargar los archivos de la app
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(ARCHIVOS)).catch(() => {})
  );
  self.skipWaiting();
});

// Activar: limpiar versiones viejas del cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch:
//  · NETWORK-FIRST para navegaciones (el HTML): trae la última versión si hay red,
//    y cae a caché si no hay → los cambios se ven sin reinstalar la app.
//  · CACHE-FIRST para el resto de assets: rápido y offline.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // No interceptar otros dominios (ej. la API de Supabase): van directo a la red.
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copia)).catch(() => {});
        return resp;
      }).catch(() => caches.match(req).then(c => c || caches.match('index.html') || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cacheado => {
      if (cacheado) return cacheado;
      return fetch(req).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copia)).catch(() => {});
        return resp;
      }).catch(() => caches.match('index.html'));
    })
  );
});
