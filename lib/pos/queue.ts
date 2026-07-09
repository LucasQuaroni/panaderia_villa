/**
 * Cola local de ventas para el modo offline.
 *
 * Cada cobro se guarda primero acá (en el navegador, persiste aunque se cierre
 * la pestaña) y se sincroniza a Supabase cuando hay conexión. Como cada venta
 * lleva un `client_uuid` único y la función register_sale es idempotente,
 * reintentar una venta nunca la duplica.
 */

export interface PendingSaleItem {
  product_id: string | null
  description: string
  unit: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface PendingSale {
  client_uuid: string
  cash_session_id: string | null
  payment_method: string
  items: PendingSaleItem[]
  created_at: string
}

const KEY = 'pos_pending_sales'

function read(): PendingSale[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PendingSale[]) : []
  } catch {
    return []
  }
}

function write(list: PendingSale[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(list))
}

export function getPending(): PendingSale[] {
  return read()
}

export function pendingCount(): number {
  return read().length
}

export function addPending(sale: PendingSale) {
  const list = read()
  list.push(sale)
  write(list)
}

export function removePending(clientUuid: string) {
  write(read().filter((s) => s.client_uuid !== clientUuid))
}
