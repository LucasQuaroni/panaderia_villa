'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'

type Client = ReturnType<typeof createClient>
type Item = { product_id: string | null; description: string; unit: string; quantity: number; stock_quantity: number | null }
type Sale = { id: string; sold_at: string; sale_channel: string; payment_method: string; items: Item[] }
type Movement = { id: string; product_id: string | null; delta: number; reason: string; ref_type: string | null; ref_id: string | null; created_at: string }
type AuditRow = { key: string; at: string; saleId: string; channel: string; product: string; unit: string; sold: number; expected: number; actual: number; free: boolean }

const localDay = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const qty = (value: number) => value.toLocaleString('es-AR', { maximumFractionDigits: 3 })
const time = (value: string) => new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

export default function StockAudit({ supabase }: { supabase: Client }) {
  const [day, setDay] = useState(localDay)
  const [sales, setSales] = useState<Sale[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [manual, setManual] = useState<Movement[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const start = new Date(`${day}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    const from = start.toISOString(), to = end.toISOString()
    const [saleResult, manualResult, productResult] = await Promise.all([
      supabase.from('sales')
        .select('id,sold_at,sale_channel,payment_method,items:sale_items(product_id,description,unit,quantity,stock_quantity)')
        .gte('sold_at', from).lt('sold_at', to).order('sold_at', { ascending: false }).limit(100),
      supabase.from('stock_movements')
        .select('id,product_id,delta,reason,ref_type,ref_id,created_at')
        .gte('created_at', from).lt('created_at', to).not('product_id', 'is', null)
        .or('ref_type.is.null,ref_type.neq.sale')
        .order('created_at', { ascending: false }).limit(100),
      supabase.from('products').select('id,name'),
    ])
    if (saleResult.error || manualResult.error || productResult.error) {
      setError(saleResult.error?.message ?? manualResult.error?.message ?? productResult.error?.message ?? 'No se pudo cargar el historial.')
      setLoading(false)
      return
    }
    const saleRows = (saleResult.data ?? []) as unknown as Sale[]
    const ids = saleRows.map(sale => sale.id)
    const movementResult = ids.length
      ? await supabase.from('stock_movements')
        .select('id,product_id,delta,reason,ref_type,ref_id,created_at')
        .eq('ref_type', 'sale').in('ref_id', ids).limit(1000)
      : { data: [] as Movement[], error: null }
    if (movementResult.error) {
      setError(movementResult.error.message)
      setLoading(false)
      return
    }
    setSales(saleRows)
    setMovements((movementResult.data ?? []) as Movement[])
    setManual((manualResult.data ?? []) as Movement[])
    setNames(Object.fromEntries((productResult.data ?? []).map(product => [product.id, product.name])))
    setError('')
    setLoading(false)
  }, [supabase, day])

  useEffect(() => { void load() }, [load])

  const rows = useMemo(() => {
    const actual = new Map<string, number>()
    for (const movement of movements) {
      if (!movement.ref_id || !movement.product_id) continue
      const key = `${movement.ref_id}:${movement.product_id}`
      actual.set(key, (actual.get(key) ?? 0) - Number(movement.delta))
    }
    const result: AuditRow[] = []
    for (const sale of sales) {
      const grouped = new Map<string, AuditRow>()
      for (const item of sale.items) {
        if (item.description.startsWith('__MAYORISTA__:')) continue
        const key = item.product_id ? `${sale.id}:${item.product_id}` : `${sale.id}:libre:${grouped.size}`
        const existing = grouped.get(key)
        const sold = Number(item.quantity)
        const expected = item.product_id ? Number(item.stock_quantity ?? item.quantity) : 0
        if (existing) { existing.sold += sold; existing.expected += expected }
        else grouped.set(key, {
          key, at: sale.sold_at, saleId: sale.id, channel: sale.sale_channel,
          product: item.description, unit: item.unit, sold, expected,
          actual: item.product_id ? actual.get(key) ?? 0 : 0, free: !item.product_id,
        })
      }
      result.push(...grouped.values())
    }
    return result
  }, [sales, movements])
  const shown = rows.filter(row => row.product.toLocaleLowerCase('es-AR').includes(filter.toLocaleLowerCase('es-AR')))
  const mismatches = rows.filter(row => !row.free && Math.abs(row.expected - row.actual) > 0.0001).length

  return <section className="mt-8 rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
    <div className="p-4 border-b border-border">
      <h2 className="font-sans text-xl font-bold text-charcoal">Registro de ventas y descuentos</h2>
      <p className="font-body text-sm text-warm-gray mt-1">Compara lo cargado en la venta con los movimientos que realmente afectaron el stock.</p>
      <div className="mt-3 flex flex-wrap gap-2 items-center">
        <input type="date" value={day} onChange={event => setDay(event.target.value)} className="rounded-lg border border-border px-3 py-2 font-body text-sm" />
        <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar producto" className="rounded-lg border border-border px-3 py-2 font-body text-sm" />
        <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-border px-3 py-2 font-body text-sm disabled:opacity-50">Actualizar</button>
        {!loading && !error && <span className={`font-body text-sm ${mismatches ? 'text-red-700 font-semibold' : 'text-green-700'}`}>{mismatches} diferencias detectadas</span>}
      </div>
      {sales.length === 100 && <p className="mt-2 text-xs text-amber-700">Se muestran las últimas 100 ventas del día.</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[740px] text-sm font-body"><thead><tr className="bg-cream-dark text-warm-gray text-xs uppercase"><th className="p-3 text-left">Hora / venta</th><th className="p-3 text-left">Producto</th><th className="p-3 text-right">Cargado</th><th className="p-3 text-right">Debía bajar</th><th className="p-3 text-right">Bajó</th><th className="p-3 text-left">Estado</th></tr></thead><tbody>
        {shown.map(row => {
          const mismatch = !row.free && Math.abs(row.expected - row.actual) > 0.0001
          return <tr key={row.key} className="border-t border-border/60"><td className="p-3 text-warm-gray">{time(row.at)} · {row.channel}<div className="text-[10px] font-mono" title={row.saleId}>{row.saleId.slice(0, 8)}</div></td><td className="p-3 font-semibold text-charcoal">{row.product}</td><td className="p-3 text-right font-num">{qty(row.sold)} {row.unit}</td><td className="p-3 text-right font-num">{qty(row.expected)}</td><td className="p-3 text-right font-num">{qty(row.actual)}</td><td className={`p-3 ${mismatch ? 'font-semibold text-red-700' : 'text-warm-gray'}`}>{row.free ? 'Renglón sin producto: no descuenta' : mismatch ? 'Revisar' : 'Correcto'}</td></tr>
        })}
        {!loading && shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-warm-gray">Sin ventas para esta fecha o filtro.</td></tr>}
      </tbody></table>
    </div>
    <div className="p-4 border-t border-border">
      <h3 className="font-semibold text-charcoal">Otros movimientos del día</h3>
      <p className="text-xs text-warm-gray mb-2">Ajustes, mermas y anulaciones también cambian la existencia.</p>
      {manual.length === 0 ? <p className="text-sm text-warm-gray">No hubo otros movimientos.</p> : <div className="max-h-48 overflow-y-auto divide-y divide-border/60">{manual.map(movement => <div key={movement.id} className="flex justify-between gap-3 py-2 text-sm"><span>{time(movement.created_at)} · {names[movement.product_id ?? ''] ?? 'Producto eliminado'} · {movement.reason}</span><span className="font-num">{Number(movement.delta) > 0 ? '+' : ''}{qty(Number(movement.delta))}</span></div>)}</div>}
    </div>
  </section>
}
