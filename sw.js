const CACHE = 'pdf-editor-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './libs/pdf.min.js',
  './libs/pdf.worker.min.js',
  './libs/fabric.min.js',
  './libs/pdf-lib.min.js',
  './libs/phosphor/style.css',
  './libs/phosphor/Phosphor.woff2',
  './libs/fonts/dancing-script.woff2',
  './libs/fonts/pacifico.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy));
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;

  // La page elle-même part du réseau : sinon une nouvelle version mise en ligne
  // resterait invisible derrière le cache. Le cache ne sert que hors connexion.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => { if (res.ok) cachePut(e.request, res); return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Les bibliothèques et polices ne changent jamais de nom : le cache d'abord.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) =>
      hit ||
      fetch(e.request).then((res) => {
        if (res.ok) cachePut(e.request, res);
        return res;
      })
    )
  );
});
