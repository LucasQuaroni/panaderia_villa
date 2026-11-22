'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dayBounds, fmtStockQty, fmtTime, localDay, movementLabel } from '@/lib/stock'
import { ChevronDown, ChevronLeft, ChevronRight, Clock, History, RefreshCw, Search } from 'lucide-react'

type HistoryRow = {
  product_id: string
  name: string
  unit: string
  active: boolean
  opening: number
  sold: number
  waste: number
  adjustments: number
  closing: number
  movement_count: number
}
type Movement = { id: string; delta: number; reason: string; ref_type: string | null; created_at: string }

const unitLabel = (unit: string) => unit === 'kg' ? 'kg' : 'u.'
const signed = (value: number) => {
  if (Math.abs(value) < 0.0005) return '—'
  return `${value > 0 ? '+' : '−'}${fmtStockQty(Math.abs(value))}`
}
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDay(date)
}
const longDate = (day: string) => {
  const text = new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return text.charAt(0).toLocaleUpperCase('es-AR') + text.slice(1)
}

export default function StockHistoryPage() {
  // "Hoy" depende de la zona horaria del navegador, no de la del servidor
  // (de noche en Argentina el servidor en UTC ya está en el día siguiente).
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => { setToday(localDay()) }, [])

  return <div className="max-w-6xl mx-auto">
    <div className="mb-6">
      <h1 className="font-sans text-3xl font-bold text-charcoal flex items-center gap-3"><History size={28} className="text-burgundy" /> Historial de stock</h1>
      <p className="font-body text-warm-gray mt-1">Consultá cuánto stock había al empezar un día, cuánto quedó al final y cuánto había a una hora puntual.</p>
    </div>
    {today ? <StockHistory today={today} /> : <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>}
  </div>
}

function StockHistory({ today }: { today: string }) {
  const [supabase] = useState(() => createClient())
  const [day, setDay] = useState(today)
  const [time, setTime] = useState('')
  const [search, setSearch] = useState('')
  const [onlyMoved, setOnlyMoved] = useState(false)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<Movement[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  // Descarta respuestas viejas si se cambia de día o de producto rápidamente.
  const loadRequest = useRef(0)
  const detailRequest = useRef(0)

  // Período consultado: desde las 00:00 del día hasta la hora elegida (o el fin del día).
  const range = useMemo(() => {
    const { start, end } = dayBounds(day)
    return { start, until: time ? new Date(`${day}T${time}:00`) : end }
  }, [day, time])
  const isToday = day === today
  const closingLabel = time ? `A las ${time}` : isToday ? 'Ahora' : 'Al cierre del día'
  const futureTime = isToday && range.until.getTime() > Date.now() && Boolean(time)

  const load = useCallback(async () => {
    const request = ++loadRequest.current
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('stock_history', {
      p_from: range.start.toISOString(),
      p_to: range.until.toISOString(),
    })
    if (request !== loadRequest.current) return
    if (rpcError) {
      const missing = rpcError.code === 'PGRST202' || (/stock_history/.test(rpcError.message) && /(find|exist)/i.test(rpcError.message))
      setError(missing
        ? 'Falta ejecutar la migración 013_historial_stock.sql en Supabase para habilitar el historial.'
        : `No se pudo cargar el historial: ${rpcError.message}`)
      setRows([])
    } else {
      setRows(((data ?? []) as HistoryRow[]).map((row) => ({
        ...row,
        opening: Number(row.opening), sold: Number(row.sold), waste: Number(row.waste),
        adjustments: Number(row.adjustments), closing: Number(row.closing), movement_count: Number(row.movement_count),
      })))
      setError('')
    }
    setLoading(false)
  }, [supabase, range])

  useEffect(() => { void load() }, [load])

  const loadDetail = useCallback(async (productId: string) => {
    const request = ++detailRequest.current
    setDetailLoading(true)
    setDetailError('')
    const { data, error: queryError } = await supabase.from('stock_movements')
      .select('id,delta,reason,ref_type,created_at')
      .eq('product_id', productId)
      .gte('created_at', range.start.toISOString())
      .lt('created_at', range.until.toISOString())
      .order('created_at', { ascending: true })
      .limit(1000)
    if (request !== detailRequest.current) return
    if (queryError) setDetailError(queryError.message)
    setDetail(((data ?? []) as Movement[]).map((movement) => ({ ...movement, delta: Number(movement.delta) })))
    setDetailLoading(false)
  }, [supabase, range])

  // Si cambia el período, el detalle abierto se recarga con el nuevo rango.
  useEffect(() => { if (expanded) void loadDetail(expanded) }, [expanded, loadDetail])

  const toggle = (productId: string) => {
    setDetail([])
    setExpanded((current) => current === productId ? null : productId)
  }

  const shown = rows.filter((row) =>
    (!onlyMoved || row.movement_count > 0) &&
    row.name.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR')))
  const movedCount = rows.filter((row) => row.movement_count > 0).length
  const negativeCount = rows.filter((row) => row.closing < 0).length

  return <>
    <div className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Día</label>
          <div className="flex items-center gap-1">
            <button onClick={() => setDay((current) => shiftDay(current, -1))} title="Día anterior" className="p-2 rounded-lg border border-border text-warm-gray hover:text-charcoal"><ChevronLeft size={16} /></button>
            <input type="date" value={day} max={today} onChange={(event) => event.target.value && setDay(event.target.value)} className="rounded-lg border border-border px-3 py-2 font-body text-sm" />
            <button onClick={() => setDay((current) => shiftDay(current, 1))} disabled={day >= today} title="Día siguiente" className="p-2 rounded-lg border border-border text-warm-gray hover:text-charcoal disabled:opacity-30"><ChevronRight size={16} /></button>
            {!isToday && <button onClick={() => setDay(today)} className="px-3 py-2 rounded-lg border border-border font-body text-xs font-semibold text-warm-gray hover:text-charcoal">Hoy</button>}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Hasta la hora (opcional)</label>
          <div className="flex items-center gap-1">
            <div className="relative"><Clock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" /><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="rounded-lg border border-border pl-9 pr-3 py-2 font-body text-sm" /></div>
            {time && <button onClick={() => setTime('')} className="px-3 py-2 rounded-lg border border-border font-body text-xs font-semibold text-warm-gray hover:text-charcoal">Día completo</button>}
          </div>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Producto</label>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto..." className="w-full rounded-lg border border-border pl-9 pr-3 py-2 font-body text-sm" /></div>
        </div>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white text-warm-gray font-body text-xs font-semibold hover:text-charcoal disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 font-body text-sm">
        <p className="text-charcoal"><span className="font-semibold">{longDate(day)}</span>{' · '}<span className="text-warm-gray">{time ? `de 00:00 a ${time}` : isToday ? 'de 00:00 hasta este momento' : 'día completo'}</span></p>
        <label className="flex items-center gap-2 text-warm-gray cursor-pointer"><input type="checkbox" checked={onlyMoved} onChange={(event) => setOnlyMoved(event.target.checked)} className="w-4 h-4 accent-burgundy" /> Solo productos con movimientos ({movedCount})</label>
      </div>
      {futureTime && <p className="font-body text-xs text-amber-700">La hora elegida todavía no llegó: se muestra el stock hasta este momento.</p>}
      {negativeCount > 0 && !loading && <p className="font-body text-xs text-red-700">{negativeCount} {negativeCount === 1 ? 'producto quedó' : 'productos quedaron'} con stock negativo: se vendió más de lo que figuraba cargado.</p>}
    </div>

    {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-body text-sm">{error}</div>}

    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-x-auto">
      <table className="w-full min-w-[820px] font-body text-sm">
        <thead>
          <tr className="bg-cream-dark border-b border-border text-xs text-warm-gray uppercase tracking-wide">
            <th className="text-left px-4 py-3">Producto</th>
            <th className="text-right px-4 py-3">Al inicio<span className="block normal-case tracking-normal text-[10px]">00:00</span></th>
            <th className="text-right px-4 py-3">Vendido</th>
            <th className="text-right px-4 py-3">Mermas</th>
            <th className="text-right px-4 py-3">Ajustes y conteos</th>
            <th className="text-right px-4 py-3 bg-burgundy/5">{closingLabel}</th>
            <th className="px-2 py-3 w-8" />
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && <tr><td colSpan={7} className="text-center py-16 text-warm-gray">Cargando...</td></tr>}
          {shown.map((row) => {
            const open = expanded === row.product_id
            let running = row.opening
            return <Fragment key={row.product_id}>
              <tr onClick={() => toggle(row.product_id)} className={`border-b border-border/50 cursor-pointer hover:bg-cream/30 ${open ? 'bg-cream/40' : ''}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-charcoal">{row.name}</div>
                  <div className="text-xs text-warm-gray">{row.unit === 'kg' ? 'Por kilo' : 'Por unidad'}{!row.active && ' · dado de baja'}{row.movement_count > 0 && ` · ${row.movement_count} ${row.movement_count === 1 ? 'movimiento' : 'movimientos'}`}</div>
                </td>
                <td className={`px-4 py-3 text-right font-num ${row.opening < 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmtStockQty(row.opening)} <span className="text-xs text-warm-gray">{unitLabel(row.unit)}</span></td>
                <td className="px-4 py-3 text-right font-num text-warm-gray">{signed(-row.sold)}</td>
                <td className="px-4 py-3 text-right font-num text-warm-gray">{signed(-row.waste)}</td>
                <td className="px-4 py-3 text-right font-num text-warm-gray">{signed(row.adjustments)}</td>
                <td className={`px-4 py-3 text-right font-num font-bold bg-burgundy/5 ${row.closing < 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmtStockQty(row.closing)} <span className="text-xs font-normal text-warm-gray">{unitLabel(row.unit)}</span></td>
                <td className="px-2 py-3 text-warm-gray"><ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} /></td>
              </tr>
              {open && <tr className="border-b border-border/50 bg-cream/20">
                <td colSpan={7} className="px-4 py-3">
                  {detailLoading ? <p className="text-warm-gray text-sm py-2">Cargando movimientos...</p>
                    : detailError ? <p className="text-red-700 text-sm py-2">{detailError}</p>
                    : <div className="max-w-2xl ml-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="text-xs text-warm-gray uppercase"><th className="text-left py-1.5">Hora</th><th className="text-left py-1.5">Movimiento</th><th className="text-right py-1.5">Cantidad</th><th className="text-right py-1.5">Stock después</th></tr></thead>
                        <tbody>
                          <tr className="border-t border-border/50 text-warm-gray"><td className="py-1.5">00:00</td><td className="py-1.5">Stock al inicio del día</td><td /><td className="py-1.5 text-right font-num">{fmtStockQty(row.opening)}</td></tr>
                          {detail.map((movement) => {
                            running += movement.delta
                            return <tr key={movement.id} className="border-t border-border/50">
                              <td className="py-1.5 text-warm-gray">{fmtTime(movement.created_at)}</td>
                              <td className="py-1.5 text-charcoal">{movementLabel(movement.reason, movement.ref_type)}</td>
                              <td className={`py-1.5 text-right font-num ${movement.delta < 0 ? 'text-red-700' : 'text-green-700'}`}>{signed(movement.delta)}</td>
                              <td className={`py-1.5 text-right font-num ${running < 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmtStockQty(running)}</td>
                            </tr>
                          })}
                          {detail.length === 0 && <tr className="border-t border-border/50"><td colSpan={4} className="py-2 text-warm-gray">Sin movimientos en este período: el stock no cambió.</td></tr>}
                          <tr className="border-t-2 border-border font-semibold"><td className="py-1.5">{time || (isToday ? 'Ahora' : '24:00')}</td><td className="py-1.5">{closingLabel === 'Al cierre del día' ? 'Stock al cierre del día' : `Stock ${closingLabel.toLocaleLowerCase('es-AR')}`}</td><td /><td className="py-1.5 text-right font-num">{fmtStockQty(row.closing)}</td></tr>
                        </tbody>
                      </table>
                      {detail.length === 1000 && <p className="text-xs text-amber-700 mt-1">Se muestran los primeros 1000 movimientos.</p>}
                    </div>}
                </td>
              </tr>}
            </Fragment>
          })}
          {!loading && !error && shown.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-warm-gray">{onlyMoved ? 'Ningún producto tuvo movimientos en este período.' : 'No hay productos que coincidan con la búsqueda.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <p className="mt-3 font-body text-xs text-warm-gray">Inicio − vendido − mermas ± ajustes y conteos = {closingLabel.toLocaleLowerCase('es-AR')}. “Vendido” es neto de anulaciones y correcciones e incluye el consumo interno. Tocá un producto para ver cada movimiento y cuánto stock había después de cada uno.</p>
  </>
}
