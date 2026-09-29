/** Borradores de carritos de este navegador, separados por usuario y mostrador. */
export function cartDraftKey(kind: 'minorista' | 'mayorista', userId: string) {
  return `villa_cart_${kind}_v1_${userId}`
}

export function readCartDraft<T>(key: string): { carts: [T, T]; active: 0 | 1 } | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const draft = value as { carts?: unknown; active?: unknown }
    if (!Array.isArray(draft.carts) || draft.carts.length !== 2) return null
    return { carts: draft.carts as [T, T], active: draft.active === 1 ? 1 : 0 }
  } catch { return null }
}

export function saveCartDraft<T>(key: string, carts: [T, T], active: 0 | 1) {
  try { window.localStorage.setItem(key, JSON.stringify({ carts, active })) } catch { /* almacenamiento lleno o deshabilitado */ }
}
