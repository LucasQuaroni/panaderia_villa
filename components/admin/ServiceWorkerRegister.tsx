'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker (una vez) para habilitar el modo offline del
 * mostrador. No hace nada visible; solo prepara la app para funcionar sin
 * internet una vez que se abrió con conexión.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Evita registrarlo en desarrollo (puede complicar el hot-reload).
    if (window.location.hostname === 'localhost') return

    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* silencioso: si falla, la app sigue funcionando online */
      })
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
