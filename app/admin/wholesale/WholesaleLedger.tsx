'use client'

import { useEffect, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'

type Client = ReturnType<typeof createClient>
type SaleItem = { id: string; description: string; unit: string; quantity: number; unit_price: number; subtotal: number }
type Sale = { id: string; sold_at: string; total: number; payment_method: string; items: SaleItem[] | null }
type Payment = { id: string; received_at: string; amount: number; payment_method: string; sale_id: string | null }
type Row = { id: string; at: string; label: string; debit: number; credit: number; balance: number; items?: SaleItem[] }
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
          .eq('wholesale_customer_id', customer.id).eq('payment_method', 'Cuenta corriente')
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
      const entries = [
        ...sales.map(sale => ({ id: sale.id, at: sale.sold_at, label: 'Venta a cuenta', debit: Number(sale.total), credit: 0, items: sale.items ?? [] })),
        ...payments.map(payment => ({ id: payment.id, at: payment.received_at, label: `${payment.sale_id ? 'Abono al comprar' : 'Cobro de cuenta'} · ${payment.payment_method}`, debit: 0, credit: Number(payment.amount) })),
      ].sort((a, b) => a.at.localeCompare(b.at) || Number(b.debit > 0) - Number(a.debit > 0) || a.id.localeCompare(b.id))
      let balance = 0
      const ledger = entries.map(entry => ({ ...entry, balance: balance += entry.debit - entry.credit }))
      if (!cancelled) { setRows(ledger.reverse()); setError(''); setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [supabase, customer.id])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
    <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
      <div className="sticky top-0 flex items-center justify-between border-b border-border bg-white p-4"><div><h2 className="font-sans text-xl font-bold text-charcoal">Cuenta corriente · {customer.business_name}</h2><p className="font-body text-xs text-warm-gray">Ventas a cuenta con el detalle de lo que llevó, y cobros, incluidos los realizados en efectivo.</p></div><button onClick={onClose} className="rounded-lg border border-border px-3 py-1 text-sm">Cerrar</button></div>
      {loading ? <p className="p-6 text-sm text-warm-gray">Cargando movimientos...</p> : error ? <p className="p-6 text-sm text-red-700">{error}</p> : rows.length === 0 ? <p className="p-6 text-sm text-warm-gray">Este cliente no tiene movimientos de cuenta.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[630px] text-sm"><thead><tr className="bg-cream-dark text-xs uppercase text-warm-gray"><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Movimiento</th><th className="p-3 text-right">Debe</th><th className="p-3 text-right">Pagó</th><th className="p-3 text-right">Saldo</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-border/60"><td className="p-3 whitespace-nowrap align-top">{new Date(row.at).toLocaleString('es-AR')}</td><td className="p-3">{row.label}{row.items && row.items.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-warm-gray">{row.items.map(item => <li key={item.id} className="flex justify-between gap-3"><span>{fmtQty(Number(item.quantity), item.unit)} · {item.description}</span><span className="font-num whitespace-nowrap">{money(Number(item.subtotal))}</span></li>)}</ul>}</td><td className="p-3 text-right font-num align-top">{row.debit ? money(row.debit) : '—'}</td><td className="p-3 text-right font-num text-green-700 align-top">{row.credit ? money(row.credit) : '—'}</td><td className="p-3 text-right font-num font-semibold align-top">{money(row.balance)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>
}
