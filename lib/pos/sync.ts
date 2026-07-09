import type { SupabaseClient } from '@supabase/supabase-js'
import { getPending, removePending } from './queue'

/**
 * Intenta subir a Supabase todas las ventas pendientes de la cola local.
 * Devuelve cuántas se sincronizaron. Si falla la conexión, deja las que
 * queden para el próximo intento (no se pierde ninguna).
 */
export async function syncPending(supabase: SupabaseClient): Promise<number> {
  const pending = getPending()
  let synced = 0

  for (const sale of pending) {
    const { error } = await supabase.rpc('register_sale', {
      p_client_uuid: sale.client_uuid,
      p_cash_session_id: sale.cash_session_id,
      p_payment_method: sale.payment_method,
      p_items: sale.items,
    })

    if (error) {
      // Error de red/servidor: paramos y reintentamos más tarde.
      // (register_sale es idempotente, así que reintentar es seguro.)
      break
    }

    removePending(sale.client_uuid)
    synced++
  }

  return synced
}
