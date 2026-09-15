'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Receipt, TrendingUp, ShoppingCart, CircleDollarSign,
  ChevronDown, ChevronRight, Calendar,
} from 'lucide-react'

interface SaleItem {
  id: string
  description: string
  unit: string
  quantity: number
  stock_quantity?: number | null
  unit_price: number
  subtotal: number
}
interface Sale {
  id: string
  sold_at: string
  payment_method: string | null
  total: number
  items: SaleItem[]
  sale_channel?: 'minorista' | 'mayorista'
  wholesale_customer?: { business_name: string } | null
}
interface AccountPayment {
  id: string
  amount: number
  payment_method: string
  received_at: string
  customer?: { business_name: string } | null
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shiftDay = (str: string, days: number) => {
  const d = new Date(str + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function VentasPage() {
  const supabase = createClient()
  const [day, setDay] = useState(todayStr())
  const [method, setMethod] = useState('Todos')
  const [sales, setSales] = useState<Sale[]>([])
  const [accountPayments, setAccountPayments] = useState<AccountPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchSales = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    else setRefreshing(true)
    const start = new Date(day + 'T00:00:00')
    const end = new Date(day + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    const [salesResult, paymentsResult] = await Promise.all([
      supabase
        .from('sales')
        .select('id, sold_at, payment_method, total, sale_channel, wholesale_customer:wholesale_customers(business_name), items:sale_items(id, description, unit, quantity, stock_quantity, unit_price, subtotal)')
        .gte('sold_at', start.toISOString())
        .lt('sold_at', end.toISOString())
        .order('sold_at', { ascending: false }),
      supabase
        .from('wholesale_account_payments')
        .select('id, amount, payment_method, received_at, customer:wholesale_customers(business_name)')
        .gte('received_at', start.toISOString())
        .lt('received_at', end.toISOString())
        .order('received_at', { ascending: false }),
    ])
    if (salesResult.error || paymentsResult.error) {
      setError(salesResult.error?.message ?? paymentsResult.error?.message ?? 'No se pudieron actualizar las ventas.')
    } else {
      setSales(((salesResult.data ?? []) as unknown as Sale[]).map((sale) => ({
        ...sale,
        items: sale.items.filter((item) => !item.description.startsWith('__MAYORISTA__:')),
      })))
      setAccountPayments((paymentsResult.data ?? []) as unknown as AccountPayment[])
      setError('')
      setLastUpdated(new Date())
    }
    setLoading(false)
    setRefreshing(false)
  }, [supabase, day])

  useEffect(() => { void fetchSales(true) }, [fetchSales])

  // Actualización inmediata por Realtime. El intervalo y los eventos de foco
  // son respaldo para que la pantalla nunca dependa de una recarga manual.
  useEffect(() => {
    const refresh = () => { void fetchSales(false) }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const channel = supabase
      .channel('sales-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wholesale_account_payments' }, refresh)
      .subscribe()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  }, [supabase, fetchSales])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const fmtQty = (q: number, unit: string) => unit === 'kg' ? `${q.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg` : `${q.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit}`

  const methods = ['Todos', ...Array.from(new Set(sales.map(s => s.payment_method ?? '—')))]
  const filtered = method === 'Todos' ? sales : sales.filter(s => (s.payment_method ?? '—') === method)

  const total = filtered.reduce((s, v) => s + Number(v.total), 0)
  const count = filtered.length
  const avg = count ? total / count : 0

  const byMethod: Record<string, number> = {}
  for (const s of sales) byMethod[s.payment_method ?? '—'] = (byMethod[s.payment_method ?? '—'] ?? 0) + Number(s.total)

  const qtyByProduct: Record<string, number> = {}
  for (const s of filtered) for (const it of s.items) qtyByProduct[it.description] = (qtyByProduct[it.description] ?? 0) + Number(it.stock_quantity ?? it.quantity)
  const topProducts = Object.entries(qtyByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const isToday = day === todayStr()

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Ventas</h1>
        <p className="font-body text-warm-gray mt-1">Cómo viene el día: ventas, detalle y filtros.</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1 bg-white border border-border rounded-xl p-1 shadow-sm">
          <button onClick={() => setDay(shiftDay(day, -1))} className="px-2 py-1.5 rounded-lg text-warm-gray hover:text-charcoal"><ChevronRight size={16} className="rotate-180" /></button>
          <div className="relative flex items-center gap-2 px-2">
            <Calendar size={15} className="text-warm-gray" />
            <input type="date" value={day} max={todayStr()} onChange={e => setDay(e.target.value)}
              className="font-body text-sm text-charcoal bg-transparent focus:outline-none" />
          </div>
          <button onClick={() => setDay(shiftDay(day, 1))} disabled={isToday}
            className="px-2 py-1.5 rounded-lg text-warm-gray hover:text-charcoal disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
        <button onClick={() => setDay(todayStr())}
          className={`px-3 py-2 rounded-xl font-body text-sm font-medium border ${isToday ? 'bg-burgundy text-cream border-burgundy' : 'bg-white text-warm-gray border-border hover:text-charcoal'}`}>
          Hoy
        </button>
        <select value={method} onChange={e => setMethod(e.target.value)}
          className="px-3 py-2 border border-border rounded-xl font-body text-sm bg-white focus:outline-none focus:border-burgundy">
          {methods.map(m => <option key={m} value={m}>{m === 'Todos' ? 'Todos los pagos' : m}</option>)}
        </select>
        <span className="ml-auto font-body text-xs text-warm-gray">
          {refreshing ? 'Actualizando…' : lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR')}` : ''}
        </span>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-body text-sm">{error}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><CircleDollarSign size={16} /> Total vendido</div>
          <div className="font-num text-3xl font-bold text-burgundy mt-1">{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><ShoppingCart size={16} /> Tickets</div>
          <div className="font-num text-3xl font-bold text-charcoal mt-1">{count}</div>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><TrendingUp size={16} /> Ticket promedio</div>
          <div className="font-num text-3xl font-bold text-charcoal mt-1">{fmt(avg)}</div>
        </div>
      </div>

      {/* Desglose + top */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <h3 className="font-sans font-bold text-charcoal mb-3">Por medio de pago</h3>
          {Object.keys(byMethod).length === 0 ? (
            <p className="font-body text-sm text-warm-gray">Sin ventas.</p>
          ) : Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => (
            <div key={m} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
              <span className="font-body text-sm text-charcoal">{m}</span>
              <span className="font-num text-sm font-semibold text-charcoal">{fmt(v)}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <h3 className="font-sans font-bold text-charcoal mb-3">Más vendidos</h3>
          {topProducts.length === 0 ? (
            <p className="font-body text-sm text-warm-gray">Sin ventas.</p>
          ) : topProducts.map(([name, q]) => (
            <div key={name} className="flex justify-between py-1.5 border-b border-border/40 last:border-0">
              <span className="font-body text-sm text-charcoal truncate pr-2">{name}</span>
              <span className="font-num text-sm font-semibold text-warm-gray whitespace-nowrap">{q.toLocaleString('es-AR', { maximumFractionDigits: 3 })}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Detalle de ventas */}
      <h3 className="font-sans font-bold text-charcoal mb-3 flex items-center gap-2"><Receipt size={18} /> Detalle ({filtered.length})</h3>
      {loading ? (
        <div className="text-center py-12 text-warm-gray font-body">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-border font-body text-warm-gray text-sm">
          No hay ventas para este día.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(s => {
            const open = expanded === s.id
            return (
              <div key={s.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button onClick={() => setExpanded(open ? null : s.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-cream/40 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    {open ? <ChevronDown size={16} className="text-warm-gray" /> : <ChevronRight size={16} className="text-warm-gray" />}
                    <div>
                      <div className="font-body text-sm font-semibold text-charcoal">{fmtTime(s.sold_at)} hs</div>
                      <div className="font-body text-xs text-warm-gray flex gap-1.5 items-center">{s.items.length} ítem(s) · {s.payment_method ?? '—'} {s.sale_channel === 'mayorista' && <span className="px-1.5 py-0.5 rounded bg-burgundy/10 text-burgundy font-semibold">Mayorista{s.wholesale_customer?.business_name ? ` · ${s.wholesale_customer.business_name}` : ''}</span>}</div>
                    </div>
                  </div>
                  <span className="font-num text-base font-bold text-burgundy">{fmt(Number(s.total))}</span>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-3 bg-cream/20">
                    {s.items.map(it => (
                      <div key={it.id} className="flex justify-between py-1 font-body text-sm">
                        <span className="text-charcoal">{it.description} <span className="text-warm-gray text-xs">({fmtQty(Number(it.quantity), it.unit)} × {fmt(Number(it.unit_price))})</span></span>
                        <span className="font-num font-semibold text-charcoal">{fmt(Number(it.subtotal))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h3 className="font-sans font-bold text-charcoal mt-7 mb-3 flex items-center gap-2">
        <CircleDollarSign size={18} /> Cobros de cuentas mayoristas ({accountPayments.length})
      </h3>
      <p className="font-body text-xs text-warm-gray mb-3">
        Se muestran como movimientos de cobro, sin sumarlos otra vez al total vendido.
      </p>
      {loading ? null : accountPayments.length === 0 ? (
        <div className="text-center py-8 bg-white rounded-2xl border border-border font-body text-warm-gray text-sm">
          No hubo cancelaciones de saldo este día.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {accountPayments.map(payment => (
            <div key={payment.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
              <div>
                <div className="font-body text-sm font-semibold text-charcoal">
                  {payment.customer?.business_name ?? 'Cliente mayorista'}
                </div>
                <div className="font-body text-xs text-warm-gray">
                  {fmtTime(payment.received_at)} hs · Cobro de cuenta · {payment.payment_method}
                </div>
              </div>
              <span className="font-num text-base font-bold text-green-700">{fmt(Number(payment.amount))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
