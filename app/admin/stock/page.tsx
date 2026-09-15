'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Package, RefreshCw, Search, Save, X } from 'lucide-react'

type Product = { id: string; name: string; unit: string }
type StockRow = Product & { stock: number }
const parseQty = (value: string) => Number(value.replace(',', '.'))
const fmtQty = (value: number, unit: string) => `${value.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit}`

export default function StockPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [finalQty, setFinalQty] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [manualProduct, setManualProduct] = useState<Product | null>(null)
  // Una actualización remota no debe borrar una existencia final que el
  // usuario está escribiendo. Sólo preservamos los campos realmente editados.
  const dirtyFinalIds = useRef(new Set<string>())

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      const [stockResult, productResult] = await Promise.all([
        supabase.from('product_stock').select('product_id, name, unit, stock').order('name'),
        supabase.from('products').select('id, name, unit').eq('active', true).order('name'),
      ])
      if (stockResult.error || productResult.error) {
        setError(stockResult.error?.message ?? productResult.error?.message ?? 'No se pudo cargar el stock.')
        return
      }
      const nextRows = (stockResult.data ?? []).map((row) => ({ id: row.product_id as string, name: row.name, unit: row.unit, stock: Number(row.stock) }))
      setStock(nextRows)
      setProducts((productResult.data ?? []) as Product[])
      setFinalQty((previous) => {
        const next = { ...previous }
        for (const row of nextRows) {
          if (!dirtyFinalIds.current.has(row.id)) next[row.id] = String(row.stock)
        }
        return next
      })
      setError('')
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)); void fetchAll() }, [supabase, fetchAll])

  // El movimiento queda visible de inmediato por Realtime. El intervalo y los
  // eventos de foco son respaldo si Realtime está deshabilitado en Supabase.
  useEffect(() => {
    const refresh = () => { void fetchAll() }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const channel = supabase
      .channel('stock-live-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_movements' }, refresh)
      .subscribe()
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      void supabase.removeChannel(channel)
    }
  }, [supabase, fetchAll])
  const rows = useMemo(() => products.map((product) => ({ product, current: stock.find((row) => row.id === product.id)?.stock ?? 0 })).filter(({ product }) => product.name.toLocaleLowerCase('es-AR').includes(search.toLocaleLowerCase('es-AR'))), [products, stock, search])

  const saveFinal = async (product: Product, current: number) => {
    const target = parseQty(finalQty[product.id] ?? '')
    if (!Number.isFinite(target) || target < 0) { setError(`Ingresá una existencia final válida, igual o mayor que cero, para ${product.name}.`); return }
    const delta = target - current
    if (delta === 0) { dirtyFinalIds.current.delete(product.id); setMessage('La existencia final coincide con el stock actual.'); return }
    setSavingId(product.id); setError('')
    const { error: insertError } = await supabase.from('stock_movements').insert({ product_id: product.id, delta, reason: 'ajuste', ref_type: 'existencia_final_manual', created_by: userId })
    setSavingId(null)
    if (insertError) { setError(`No se pudo guardar la existencia final: ${insertError.message}`); return }
    dirtyFinalIds.current.delete(product.id)
    setMessage(`${product.name}: existencia final actualizada a ${fmtQty(target, product.unit)}.`); setLoading(true); await fetchAll()
  }

  return <div className="max-w-5xl mx-auto">
    <div className="mb-6"><h1 className="font-sans text-3xl font-bold text-charcoal">Stock</h1><p className="font-body text-warm-gray mt-1">Actualizá manualmente la existencia final. Las ventas descuentan el peso o las unidades vendidas.</p></div>
    {message && <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">{message}</div>}
    {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-body text-sm">{error}</div>}
    <div className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm flex gap-3"><AlertTriangle size={19} className="text-burgundy mt-0.5 shrink-0" /><p className="font-body text-sm text-warm-gray">No hay producción, stock base ni reposición automática. Para corregir un conteo, escribí la cantidad que realmente quedó y guardala. Para una merma o corrección puntual, usá el botón de cada producto.</p></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="relative w-full max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto por nombre..." className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl font-body text-sm focus:outline-none focus:border-burgundy bg-white" /></div><div className="flex items-center gap-3"><span className="font-body text-xs text-warm-gray">{lastUpdated ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR')}` : 'Sin actualizar'}</span><button onClick={() => void fetchAll()} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white text-warm-gray font-body text-xs font-semibold hover:text-charcoal disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Actualizar</button></div></div>
    {loading ? <div className="text-center py-16 text-warm-gray font-body">Cargando...</div> : <div className="bg-white rounded-2xl border border-border shadow-sm overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr className="bg-cream-dark border-b border-border"><th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Producto</th><th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Stock actual</th><th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Existencia final contada</th><th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Acciones</th></tr></thead><tbody>{rows.map(({ product, current }) => <tr key={product.id} className="border-b border-border/50 hover:bg-cream/30"><td className="px-4 py-3 font-body text-sm font-semibold text-charcoal">{product.name}</td><td className={`px-4 py-3 text-right font-num text-sm font-bold ${current < 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmtQty(current, product.unit)}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><input type="text" inputMode="decimal" value={finalQty[product.id] ?? ''} onChange={(event) => { dirtyFinalIds.current.add(product.id); setFinalQty((previous) => ({ ...previous, [product.id]: event.target.value })) }} className="w-28 px-3 py-2 border border-border rounded-lg font-num text-sm focus:outline-none focus:border-burgundy" /><span className="font-body text-xs text-warm-gray">{product.unit}</span></div></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => void saveFinal(product, current)} disabled={savingId === product.id} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-burgundy text-cream font-body text-xs font-semibold hover:bg-burgundy-dark disabled:opacity-50"><Save size={14} /> Guardar final</button><button onClick={() => setManualProduct(product)} className="px-3 py-2 rounded-lg border border-border text-warm-gray font-body text-xs font-semibold hover:text-charcoal hover:bg-cream">Merma / ajuste</button></div></td></tr>)}</tbody></table>{rows.length === 0 && <div className="text-center py-12 text-warm-gray font-body text-sm">No hay productos que coincidan con la búsqueda.</div>}</div>}
    {manualProduct && <ManualModal supabase={supabase} userId={userId} product={manualProduct} onClose={() => setManualProduct(null)} onSaved={async (text) => { setManualProduct(null); setMessage(text); setLoading(true); await fetchAll() }} />}
  </div>
}

function ManualModal({ supabase, userId, product, onClose, onSaved }: { supabase: ReturnType<typeof createClient>; userId: string | null; product: Product; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState(''); const [reason, setReason] = useState<'merma' | 'ajuste'>('merma'); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const save = async () => { const delta = parseQty(quantity); if (!Number.isFinite(delta) || delta === 0) { setError('Ingresá una cantidad distinta de cero. Usá negativo para descontar o positivo para sumar.'); return }; setSaving(true); const { error: insertError } = await supabase.from('stock_movements').insert({ product_id: product.id, delta, reason, ref_type: 'movimiento_manual', created_by: userId }); setSaving(false); if (insertError) { setError(insertError.message); return }; await onSaved(`${reason === 'merma' ? 'Merma' : 'Ajuste'} registrado para ${product.name}: ${delta > 0 ? '+' : ''}${fmtQty(delta, product.unit)}.`) }
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between p-5 border-b border-border"><h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><Package size={18} /> Merma / ajuste</h2><button onClick={onClose} className="text-warm-gray hover:text-charcoal"><X size={20} /></button></div><div className="p-5 flex flex-col gap-4"><p className="font-body text-sm text-warm-gray"><span className="font-semibold text-charcoal">{product.name}</span>. Usá una cantidad negativa para descontar y positiva para sumar.</p><div><label className="font-body text-xs text-warm-gray uppercase tracking-wide">Cantidad ({product.unit})</label><input autoFocus type="text" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ej.: -0,5 o 2" className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg font-num text-sm focus:outline-none focus:border-burgundy" /></div><div><label className="font-body text-xs text-warm-gray uppercase tracking-wide">Tipo</label><select value={reason} onChange={(event) => setReason(event.target.value as 'merma' | 'ajuste')} className="mt-1 w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm bg-white"><option value="merma">Merma / descarte</option><option value="ajuste">Ajuste puntual</option></select></div>{error && <p className="font-body text-sm text-red-600">{error}</p>}<button onClick={() => void save()} disabled={saving} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50"><Save size={16} /> {saving ? 'Guardando...' : 'Registrar movimiento'}</button></div></div></div>
}
