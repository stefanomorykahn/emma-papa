/* ============================================================
   service-worker.js  ·  Emma & Papá
   Cache básico para que la app funcione sin internet (offline).
   Estrategia: "cache first" para los archivos de la app.
   Cambia CACHE_VERSION cuando actualices el código.
   ============================================================ */
const CACHE_VERSION = 'emma-v13';
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

// Fetch: responder desde cache; si no está, ir a la red y guardar
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  // No interceptar llamadas a otros dominios (ej. la API de Supabase):
  // deben ir directo a la red para sincronizar.
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cacheado => {
      if (cacheado) return cacheado;
      return fetch(event.request).then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(event.request, copia)).catch(() => {});
        return resp;
      }).catch(() => caches.match('index.html'));
    })
  );
});
