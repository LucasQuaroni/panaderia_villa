/**
 * Caché local (persistente) de datos del mostrador para que arranque offline.
 * Guarda el último catálogo de productos y la caja abierta, así la pantalla
 * funciona aunque se abra sin internet (tras haberla usado con conexión).
 */

const PRODUCTS_KEY = 'pos_cached_products'
const SESSION_KEY = 'pos_cached_session'

function get<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function set(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* almacenamiento lleno o no disponible: se ignora */
  }
}

export function cacheProducts<T>(products: T[]) {
  set(PRODUCTS_KEY, products)
}
export function getCachedProducts<T>(): T[] {
  return get<T[]>(PRODUCTS_KEY) ?? []
}

export function cacheSession<T>(session: T | null) {
  set(SESSION_KEY, session)
}
export function getCachedSession<T>(): T | null {
  return get<T>(SESSION_KEY)
}
