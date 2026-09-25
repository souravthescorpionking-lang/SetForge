/* SetForge service worker — offline shell + per-session API cache.
 *
 * Strategy:
 *  - Navigations: network-first → cached shell → /offline.html (true offline open works)
 *  - Static assets (/_next/static, icons, manifest, logo): cache-first (content-hashed/immutable)
 *  - API GETs: network-first → per-SESSION cache fallback (never leaks across users:
 *    the cache key embeds the sf_session cookie value, and logout wipes all caches)
 *  - Mutations / websockets / HMR: never intercepted
 */
const VERSION = "v1.0.1";
const SHELL_CACHE = `sf-shell-${VERSION}`;
const ASSET_CACHE = `sf-assets-${VERSION}`;
const API_CACHE = `sf-api-${VERSION}`;
const API_CACHE_MAX = 80;

const SHELL_URLS = ["/", "/offline.html", "/manifest.webmanifest", "/logo.svg", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add individually — one 404 must not fail the whole install.
      await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, API_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Cache key for API responses — scoped by session cookie so different
 *  accounts never see each other's cached data. */
function apiCacheKey(request) {
  const cookie = request.headers.get("cookie") ?? "";
  const session = /(?:^|;\s*)sf_session=([^;]+)/.exec(cookie)?.[1] ?? "anon";
  return new Request(`${request.url}|sf=${session.slice(0, 18)}`);
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put("/", fresh.clone());
    return fresh;
  } catch {
    const cached = (await cache.match(request)) ?? (await cache.match("/"));
    if (cached) return cached;
    return (await cache.match("/offline.html")) ?? Response.error();
  }
}

/** Network-first with cache fallback for small files that can change
 *  (manifest, offline page) — never served stale while online. */
async function handleVolatile(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) {
    cache.put(request, fresh.clone());
    trimCache(ASSET_CACHE, 300);
  }
  return fresh;
}

async function handleApiGet(request) {
  const cache = await caches.open(API_CACHE);
  const key = apiCacheKey(request);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok && fresh.type === "basic") {
      cache.put(key, fresh.clone());
      trimCache(API_CACHE, API_CACHE_MAX);
    }
    return fresh;
  } catch {
    const cached = await cache.match(key);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: { code: "OFFLINE", message: "You are offline and this data is not cached." } }), { status: 503, headers: { "content-type": "application/json" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/health") return; // always live
    event.respondWith(handleApiGet(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/offline.html") {
    event.respondWith(handleVolatile(request, SHELL_CACHE));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/logo.svg" || url.pathname === "/robots.txt") {
    event.respondWith(handleAsset(request));
    return;
  }
  // everything else (dev HMR, source maps, …): network only
});

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil?.(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      })(),
    );
  }
});
