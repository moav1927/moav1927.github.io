// SheetClerk: app instalable que funciona sin internet.
// Solo atiende las páginas de SheetClerk (/pdf-a-excel/, /contadores/ y /en/, /pt/, /fr/, /de/, /it/); el resto pasa directo a la red.
const CACHE = 'sheetclerk-21';
const L = '/pdf-a-excel/lib/';
const BASICO = ['/pdf-a-excel/', '/contadores/', '/en/', '/pt/', '/fr/', '/de/', '/it/', '/pdf-a-excel/motor.js?v=21', '/pdf-a-excel/estilo.css?v=21', '/pdf-a-excel/lang.js?v=21', '/pdf-a-excel/i18n.js?v=21',
  L + 'pdf.min.js', L + 'pdf.worker.min.js', L + 'xlsx.full.min.js', L + 'tesseract.min.js', L + 'fflate.min.js', L + 'mammoth.browser.min.js',
  L + 'fuentes/zilla-slab-latin-500-normal.woff2', L + 'fuentes/zilla-slab-latin-700-normal.woff2',
  L + 'fuentes/ibm-plex-sans-latin-400-normal.woff2', L + 'fuentes/ibm-plex-sans-latin-500-normal.woff2', L + 'fuentes/ibm-plex-sans-latin-600-normal.woff2',
  L + 'fuentes/ibm-plex-mono-latin-400-normal.woff2', L + 'fuentes/ibm-plex-mono-latin-600-normal.woff2',
  '/pdf-a-excel/marca/icono.svg', '/pdf-a-excel/marca/icono-32.png', '/pdf-a-excel/marca/icono-192.png'];
const propio = url => url.origin === location.origin && /^\/(pdf-a-excel|contadores|en|pt|fr|de|it)\//.test(url.pathname);

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICO)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith('cuadra-') || k.startsWith('sheetclerk-')) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !propio(url)) return;
  if (e.request.mode === 'navigate') {
    // Páginas: primero la red (para recibir mejoras), sin conexión la copia guardada
    e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('/pdf-a-excel/'))));
    return;
  }
  // Librerías, OCR, fuentes e íconos: la copia guardada; si no está, se descarga y se guarda (el OCR queda disponible sin internet)
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return res;
  })));
});
