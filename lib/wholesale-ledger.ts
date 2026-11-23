/**
 * Movimientos de un cliente mayorista: compras (a cuenta y al contado) y cobros.
 *
 * - Venta a cuenta: suma al saldo (Debe).
 * - Compra al contado (Efectivo / Transferencia): se muestra con el detalle de
 *   lo que llevó, en Debe y en Pagó por el mismo importe, así no cambia el saldo.
 * - Cobros y abonos: restan del saldo (Pagó).
 */

export type LedgerSaleItem = { id: string; description: string; unit: string; quantity: number; unit_price: number; subtotal: number }
export type LedgerSale = { id: string; sold_at: string; total: number; payment_method: string; items: LedgerSaleItem[] | null }
export type LedgerPayment = { id: string; received_at: string; amount: number; payment_method: string; sale_id: string | null }
export type LedgerRow = { id: string; at: string; label: string; debit: number; credit: number; balance: number; items?: LedgerSaleItem[] }

/** Medios de pago de las ventas mayoristas que se muestran en Movimientos. */
export const LEDGER_SALE_METHODS = ['Cuenta corriente', 'Efectivo', 'Transferencia']

/** Renglones internos de las ventas mayoristas viejas (agosto), que no son productos. */
const isProductItem = (item: LedgerSaleItem) => !item.description.startsWith('__MAYORISTA__:')

/** Arma los movimientos con su saldo acumulado, del más nuevo al más viejo. */
export function buildWholesaleLedger(sales: LedgerSale[], payments: LedgerPayment[]): LedgerRow[] {
  const entries = [
    ...sales.map(sale => {
      const total = Number(sale.total)
      const items = (sale.items ?? []).filter(isProductItem)
      return sale.payment_method === 'Cuenta corriente'
        ? { id: sale.id, at: sale.sold_at, label: 'Venta a cuenta', debit: total, credit: 0, items }
        : { id: sale.id, at: sale.sold_at, label: `Compra al contado · ${sale.payment_method}`, debit: total, credit: total, items }
    }),
    ...payments.map(payment => ({
      id: payment.id,
      at: payment.received_at,
      label: `${payment.sale_id ? 'Abono al comprar' : 'Cobro de cuenta'} · ${payment.payment_method}`,
      debit: 0,
      credit: Number(payment.amount),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at) || Number(b.debit > 0) - Number(a.debit > 0) || a.id.localeCompare(b.id))

  let balance = 0
  return entries.map(entry => ({ ...entry, balance: balance += entry.debit - entry.credit })).reverse()
}
