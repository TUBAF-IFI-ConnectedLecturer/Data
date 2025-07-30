// Import Workbox from CDN
importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.1.0/workbox-sw.js'
)

// Optional: enable Workbox debug logging in development
workbox.setConfig({ debug: false })

// Force waiting service worker to become active
self.skipWaiting()
workbox.core.clientsClaim()

// Clean up outdated precaches
workbox.precaching.cleanupOutdatedCaches()

// Precache all assets injected by injectManifest
// ⚠️ This placeholder must exist and will be replaced at build time
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST)

// Optional: Cache navigation requests (for multi-page apps or SPAs)
workbox.routing.registerRoute(
  ({ request }) => request.mode === 'navigate',
  new workbox.strategies.NetworkFirst({
    cacheName: 'html-cache',
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 10,
      }),
    ],
  })
)

// Example: Cache fonts with stale-while-revalidate
workbox.routing.registerRoute(
  ({ url }) =>
    url.pathname.endsWith('.woff2') || url.pathname.endsWith('.woff'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'font-cache',
  })
)

// Optional: Cache external CDN resources if needed
// (e.g., for JS, CSS from CDN)
workbox.routing.registerRoute(
  ({ url }) =>
    url.origin.includes('cdn.jsdelivr.net') || url.origin.includes('unpkg.com'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'cdn-cache',
  })
)
