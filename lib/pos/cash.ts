import type { createClient } from '@/lib/supabase/client'

export interface CashMovement {
  id: string
  cash_session_id: string | null
  occurred_at: string
  source: 'sale' | 'account_payment' | 'correction'
  sale_channel: 'minorista' | 'mayorista'
  customer_name: string
  payment_method: 'Efectivo' | 'Transferencia'
  amount: number
  sale_id: string | null
  detail: string
}
export interface SalePaymentSummary {
  sale_id: string
  cash_session_id: string | null
  sale_channel: 'minorista' | 'mayorista'
  payment_method: string
  total: number
  cash_paid: number
  transfer_paid: number
  debt_amount: number
}

export const cashMovementLabel = (row: CashMovement) => row.source === 'sale'
  ? `Venta ${row.sale_channel}`
  : row.source === 'correction' ? 'Ajuste por corrección' : row.sale_channel === 'mayorista' ? 'Cobro de cuenta mayorista' : 'Cobro de fiado minorista'

export function summarizeCash(rows: CashMovement[]) {
  const sum = (entries: CashMovement[]) => entries.reduce((cents, row) => cents + Math.round(Number(row.amount) * 100), 0) / 100
  const cash = sum(rows.filter(row => row.payment_method === 'Efectivo'))
  const transfer = sum(rows.filter(row => row.payment_method === 'Transferencia'))
  const sales = sum(rows.filter(row => row.source === 'sale'))
  const accounts = sum(rows.filter(row => row.source === 'account_payment'))
  const adjustments = sum(rows.filter(row => row.source === 'correction'))
  return { cash, transfer, sales, accounts, adjustments, total: sum(rows) }
}

export async function loadCashMovements(client: ReturnType<typeof createClient>, sessionIds: string[]) {
  const rows: CashMovement[] = []
  if (!sessionIds.length) return rows
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('cash_movements').select('*')
      .in('cash_session_id', sessionIds).order('occurred_at', { ascending: false }).order('id').range(offset, offset + 499)
    if (error) throw new Error(`No se pudieron cargar los movimientos de caja: ${error.message}`)
    rows.push(...(data ?? []) as CashMovement[])
    if ((data ?? []).length < 500) return rows
  }
}
