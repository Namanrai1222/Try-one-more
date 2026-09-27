/**
 * Offline shell (PRD.md Phase 6). Same-origin GETs only — the realtime server, analytics and
 * anything third-party are never touched. Pages are network-first (always fresh when online,
 * the last copy when not); content-hashed build files and fonts are cache-first. Levels ship
 * inside the game's JS, so a level played once is playable offline.
 *
 * Bump CACHE when this file's behaviour changes; old caches are deleted on activate.
 */
const CACHE = 'jom-shell-v1';
const SHELL = ['/', '/play/rage', '/play/rage/levels'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // The pages, plus the build files they load first, so the shell works offline after
      // one visit (the game's lazy chunk is cached the first time it is played).
      for (const page of SHELL) {
        const res = await fetch(page);
        if (!res.ok) continue;
        const html = await res.clone().text();
        await cache.put(page, res);
        const files = [...html.matchAll(/\/_next\/static\/[^"'\s)]+/g)].map((m) => m[0]);
        await cache.addAll([...new Set(files)]).catch(() => {});
      }
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const keep = (request, response) => {
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((res) => keep(request, res))),
    );
  } else if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => keep(request, res))
        .catch(() =>
          caches
            .match(request, { ignoreSearch: true })
            .then((hit) => hit ?? caches.match('/'))
            .then((hit) => hit ?? Response.error()),
        ),
    );
  }
});
