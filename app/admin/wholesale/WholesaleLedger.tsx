'use client'

import { useEffect, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { buildWholesaleLedger, LEDGER_SALE_METHODS, type LedgerPayment as Payment, type LedgerRow as Row, type LedgerSale as Sale } from '@/lib/wholesale-ledger'

type Client = ReturnType<typeof createClient>
const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
const fmtQty = (q: number, unit: string) => `${q.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit}`

export default function WholesaleLedger({ supabase, customer, onClose }: { supabase: Client; customer: { id: string; business_name: string }; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const sales: Sale[] = [], payments: Payment[] = []
      for (let offset = 0; ; offset += 500) {
        const { data, error: queryError } = await supabase.from('sales')
          .select('id,sold_at,total,payment_method,items:sale_items(id,description,unit,quantity,unit_price,subtotal)')
          .eq('wholesale_customer_id', customer.id).in('payment_method', LEDGER_SALE_METHODS)
          .order('sold_at', { ascending: true }).range(offset, offset + 499)
        if (queryError) { if (!cancelled) { setError(queryError.message); setLoading(false) } return }
        sales.push(...((data ?? []) as Sale[]))
        if ((data ?? []).length < 500) break
      }
      for (let offset = 0; ; offset += 500) {
        const { data, error: queryError } = await supabase.from('wholesale_account_payments')
          .select('id,received_at,amount,payment_method,sale_id')
          .eq('customer_id', customer.id)
          .order('received_at', { ascending: true }).range(offset, offset + 499)
        if (queryError) { if (!cancelled) { setError(queryError.message); setLoading(false) } return }
        payments.push(...((data ?? []) as Payment[]))
        if ((data ?? []).length < 500) break
      }
      if (!cancelled) { setRows(buildWholesaleLedger(sales, payments)); setError(''); setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [supabase, customer.id])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-white p-4"><div><h2 className="font-sans text-xl font-bold text-charcoal">Movimientos · {customer.business_name}</h2><p className="font-body text-xs text-warm-gray">Compras a cuenta y al contado con el detalle de lo que llevó, y cobros. Las compras al contado figuran como pagadas y no cambian el saldo.</p></div><button onClick={onClose} className="rounded-lg border border-border px-3 py-1 text-sm">Cerrar</button></div>
      {loading ? <p className="p-6 text-sm text-warm-gray">Cargando movimientos...</p> : error ? <p className="p-6 text-sm text-red-700">{error}</p> : rows.length === 0 ? <p className="p-6 text-sm text-warm-gray">Este cliente no tiene movimientos.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[630px] text-sm"><thead><tr className="bg-cream-dark text-xs uppercase text-warm-gray"><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Movimiento</th><th className="p-3 text-right">Debe</th><th className="p-3 text-right">Pagó</th><th className="p-3 text-right">Saldo</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-border/60"><td className="p-3 whitespace-nowrap align-top">{new Date(row.at).toLocaleString('es-AR')}</td><td className="p-3">{row.label}{row.items && row.items.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-warm-gray">{row.items.map(item => <li key={item.id} className="flex justify-between gap-3"><span>{fmtQty(Number(item.quantity), item.unit)} · {item.description}</span><span className="font-num whitespace-nowrap">{money(Number(item.subtotal))}</span></li>)}</ul>}</td><td className="p-3 text-right font-num align-top">{row.debit ? money(row.debit) : '—'}</td><td className="p-3 text-right font-num text-green-700 align-top">{row.credit ? money(row.credit) : '—'}</td><td className="p-3 text-right font-num font-semibold align-top">{money(row.balance)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>
}
