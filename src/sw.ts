/// <reference lib="webworker" />

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL, matchPrecache } from "workbox-precaching";
import { NavigationRoute, registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "v5";
const IMAGE_CACHE = `quoteflow-images-${CACHE_VERSION}`;
const STATIC_CACHE = `quoteflow-static-${CACHE_VERSION}`;
const ACTIVE_RUNTIME_CACHES = new Set([IMAGE_CACHE, STATIC_CACHE]);

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("quoteflow-") && !ACTIVE_RUNTIME_CACHES.has(cacheName))
          .map((cacheName) => caches.delete(cacheName)),
      );
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST);

const appShellHandler = createHandlerBoundToURL("/index.html");
type AppShellHandlerOptions = Parameters<typeof appShellHandler>[0];

const navigationHandler = async (options: AppShellHandlerOptions) => {
  const fetchEvent = options.event as FetchEvent;

  try {
    const preloadResponse = await fetchEvent.preloadResponse;
    if (preloadResponse) {
      return preloadResponse;
    }

    const networkResponse = await fetch(options.request);
    if (networkResponse.ok) {
      return networkResponse;
    }
  } catch {
    // Fall back to the precached shell when the network is unavailable.
  }

  return appShellHandler(options);
};

registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/offline\.html$/],
  }),
);

registerRoute(
  ({ request, url }) => request.destination === "image" && url.origin === self.location.origin,
  new CacheFirst({
    cacheName: IMAGE_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  }),
);

registerRoute(
  ({ request, url }) =>
    ["script", "style", "worker", "font"].includes(request.destination) &&
    url.origin === self.location.origin,
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 60 * 60 * 24 * 14,
      }),
    ],
  }),
);

setCatchHandler(async ({ request }) => {
  if (request.destination === "document") {
    return (await matchPrecache("/offline.html")) || Response.error();
  }

  return Response.error();
});
