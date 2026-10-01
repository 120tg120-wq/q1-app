/* ============================================================
   Service Worker — القرآن الكريم v9
   يخزّن الأصول + خطوط Google Fonts للعمل بدون إنترنت
   ============================================================ */

const CACHE_VERSION = 'quran-app-v9';

const CRITICAL_ASSETS = [
  // Bootstrap
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  // Font Awesome
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-regular-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/fa-v4compatibility.woff2',
  // html2canvas
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
  // Google Fonts CSS (يجلب ملفات woff2 تلقائياً حسب المتصفح)
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Tajawal:wght@400;500;700&display=swap'
];

async function precacheWithRetry() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(CRITICAL_ASSETS.map(async (url) => {
    const existing = await cache.match(url);
    if (existing) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (res && res.ok) {
          await cache.put(url, res.clone());
          return;
        }
      } catch (e) { /* retry */ }
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await precacheWithRetry();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_ASSETS') {
    event.waitUntil(precacheWithRetry());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (!url.startsWith('http')) return;

  const cleanUrl = url.split('?')[0];
  const isStatic = /\.(css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico|json)$/i.test(cleanUrl);
  const isCDN = url.includes('cdn.jsdelivr.net') ||
                url.includes('cdnjs.cloudflare.com') ||
                url.includes('fonts.googleapis.com') ||
                url.includes('fonts.gstatic.com');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);

    // Cache-first للأصول الثابتة و CDN وخطوط Google
    if (isStatic || isCDN) {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch (err) {
        const fallback = await cache.match(url);
        if (fallback) return fallback;
        if (cleanUrl.endsWith('.woff2') || cleanUrl.endsWith('.ttf')) {
          return new Response('', { status: 200, headers: { 'Content-Type': 'font/woff2' } });
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    }

    // Network-first للـ API (Firebase، alquran.cloud، quran.com، Groq)
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});