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
  unit_price: number
  subtotal: number
}
interface Sale {
  id: string
  sold_at: string
  payment_method: string | null
  total: number
  items: SaleItem[]
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
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchSales = useCallback(async () => {
    setLoading(true)
    const start = new Date(day + 'T00:00:00')
    const end = new Date(day + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    const { data } = await supabase
      .from('sales')
      .select('id, sold_at, payment_method, total, items:sale_items(id, description, unit, quantity, unit_price, subtotal)')
      .gte('sold_at', start.toISOString())
      .lt('sold_at', end.toISOString())
      .order('sold_at', { ascending: false })
    setSales((data ?? []) as unknown as Sale[])
    setLoading(false)
  }, [supabase, day])

  useEffect(() => { fetchSales() }, [fetchSales])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const fmtQty = (q: number, unit: string) => unit === 'kg' ? `${q.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg` : `${q}`

  const methods = ['Todos', ...Array.from(new Set(sales.map(s => s.payment_method ?? '—')))]
  const filtered = method === 'Todos' ? sales : sales.filter(s => (s.payment_method ?? '—') === method)

  const total = filtered.reduce((s, v) => s + Number(v.total), 0)
  const count = filtered.length
  const avg = count ? total / count : 0

  const byMethod: Record<string, number> = {}
  for (const s of sales) byMethod[s.payment_method ?? '—'] = (byMethod[s.payment_method ?? '—'] ?? 0) + Number(s.total)

  const qtyByProduct: Record<string, number> = {}
  for (const s of filtered) for (const it of s.items) qtyByProduct[it.description] = (qtyByProduct[it.description] ?? 0) + Number(it.quantity)
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><CircleDollarSign size={16} /> Total vendido</div>
          <div className="font-sans text-3xl font-bold text-burgundy mt-1">{fmt(total)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><ShoppingCart size={16} /> Tickets</div>
          <div className="font-sans text-3xl font-bold text-charcoal mt-1">{count}</div>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-warm-gray font-body text-sm"><TrendingUp size={16} /> Ticket promedio</div>
          <div className="font-sans text-3xl font-bold text-charcoal mt-1">{fmt(avg)}</div>
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
              <span className="font-body text-sm font-semibold text-charcoal">{fmt(v)}</span>
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
              <span className="font-body text-sm font-semibold text-warm-gray whitespace-nowrap">{q.toLocaleString('es-AR', { maximumFractionDigits: 3 })}</span>
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
                      <div className="font-body text-xs text-warm-gray">{s.items.length} ítem(s) · {s.payment_method ?? '—'}</div>
                    </div>
                  </div>
                  <span className="font-sans text-base font-bold text-burgundy">{fmt(Number(s.total))}</span>
                </button>
                {open && (
                  <div className="border-t border-border px-4 py-3 bg-cream/20">
                    {s.items.map(it => (
                      <div key={it.id} className="flex justify-between py-1 font-body text-sm">
                        <span className="text-charcoal">{it.description} <span className="text-warm-gray text-xs">({fmtQty(Number(it.quantity), it.unit)} × {fmt(Number(it.unit_price))})</span></span>
                        <span className="font-semibold text-charcoal">{fmt(Number(it.subtotal))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
