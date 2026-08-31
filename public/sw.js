const CACHE_PREFIX = 'code-editor-live-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-v1`;
const DEPENDENCY_CACHE = `${CACHE_PREFIX}dependencies-v1`;
const CDN_HOSTS = new Set(['esm.sh', 'unpkg.com', 'cdn.jsdelivr.net']);
const LEGACY_CACHE_PREFIXES = ['vfs-preview-cache-'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/index.html', '/esbuild.wasm']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (
            key.startsWith(CACHE_PREFIX) || LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ) && ![SHELL_CACHE, DEPENDENCY_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (CDN_HOSTS.has(url.host)) {
    event.respondWith(dependencyFirst(request));
  }
});

async function networkFirst(request, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request) || (fallbackPath ? await cache.match(fallbackPath) : null);
    if (cached) return cached;
    throw new Error(`Offline resource is not cached: ${request.url}`);
  }
}

async function dependencyFirst(request) {
  const cache = await caches.open(DEPENDENCY_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline dependency is not cached.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', 'X-Code-Editor-Offline': 'dependency-not-cached' },
    });
  }
}
