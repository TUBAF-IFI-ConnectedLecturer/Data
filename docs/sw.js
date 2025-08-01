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
workbox.precaching.precacheAndRoute([{"revision":"5222182be6773024083d01b94a749537","url":"Data.1e26522c.css"},{"revision":"f85f1ebe146966208352cb1e6742d43b","url":"Data.43adb6c4.css"},{"revision":"91bbbfc4acca316f637e970c9328cf90","url":"Data.670cd13c.js"},{"revision":"c2f5be21af62150a19ff7b729d51b6c2","url":"Data.7739b3e2.css"},{"revision":"0f653cf12eba11ac1443e4a55ec282b1","url":"Data.92afb07d.js"},{"revision":"4754143e8d0b43b1c8196254d8ef7549","url":"Data.beea5943.js"},{"revision":"a7d1b25607dd4d23c56da88f15626be2","url":"index.html"},{"revision":"c0e92651051695f51b9f55b2e07e50ca","url":"logo_192.fcafd453.png"},{"revision":"f19d4322a01976626628ebe10ebdc4ea","url":"logo_512.22826e58.png"},{"revision":"19440fc4b484b25d8e8c1ff21311435f","url":"manifest.webmanifest"},{"revision":"6e435534bd35da5fef04168860a9b8fa","url":"materialdesignicons-webfont.15fc987b.ttf"},{"revision":"8ced95a05e3c82d7b6ef6cd3f31c7ccb","url":"materialdesignicons-webfont.95c2af92.eot"},{"revision":"1d7bcee1b302339c3b8db10214dc9ec6","url":"materialdesignicons-webfont.96ffe6e9.woff2"},{"revision":"026b7ac9c43c7e04250f00acd510fa49","url":"materialdesignicons-webfont.fe6d5e0f.woff"}])

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
