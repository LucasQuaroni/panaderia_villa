/* Service worker del mostrador — permite que la app cargue sin internet.
 * Estrategia: "network first" (siempre intenta la red; si no hay, usa lo cacheado).
 * Así, una vez abierta con internet, la caja arranca aunque después se corte.
 */
const CACHE = 'villa-pos-v1'
const FALLBACK = '/admin/pos'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpia versiones viejas de la caché.
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Solo cachea recursos del mismo origen (evita romper llamadas a Supabase, etc.).
  if (url.origin !== self.location.origin) return

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
        return res
      })
      .catch(async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        // Para navegaciones offline sin caché exacta, devolvemos el mostrador.
        if (req.mode === 'navigate') {
          const fb = await caches.match(FALLBACK)
          if (fb) return fb
        }
        return Response.error()
      })
  )
})
