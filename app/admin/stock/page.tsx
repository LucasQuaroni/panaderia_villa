'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSetting, writeJsonSetting } from '@/lib/json-settings'
import { AlertTriangle, Factory, Flame, Package, Plus, RotateCcw, Save, Settings2, X } from 'lucide-react'

interface Product { id: string; name: string; unit: string; active: boolean }
interface StockRow { id: string; name: string; unit: string; stock: number }
interface DailySetting { product_id: string; opening_qty: number; enabled: boolean }
type Modal = null | 'produccion' | 'disponible' | 'ajuste'

const DAILY_SETTINGS_KEY = 'daily_stock_settings_v1'
const DAILY_RUN_KEY = 'daily_stock_last_run_v1'

const parseQty = (value: string) => Number(value.replace(',', '.'))
const fmtQty = (value: number, unit: string) =>
  `${value.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit}`

export default function StockPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stock, setStock] = useState<StockRow[]>([])
  const [settings, setSettings] = useState<DailySetting[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [modal, setModal] = useState<Modal>(null)

  const fetchAll = useCallback(async () => {
    const [storedSettings, lastRun, stockResult, productResult] = await Promise.all([
      readJsonSetting<DailySetting[]>(supabase, DAILY_SETTINGS_KEY, []),
      readJsonSetting<string>(supabase, DAILY_RUN_KEY, ''),
      supabase.from('product_stock').select('product_id, name, unit, stock').order('name'),
      supabase.from('products').select('id, name, unit, active').eq('active', true).order('name'),
    ])
    let nextStock = (stockResult.data ?? []).map((row) => ({
      id: row.product_id as string,
      name: row.name,
      unit: row.unit,
      stock: Number(row.stock),
    }))

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date())
    if (lastRun !== today && storedSettings.some((setting) => setting.enabled)) {
      const movements = storedSettings.filter((setting) => setting.enabled).flatMap((setting) => {
        const current = nextStock.find((row) => row.id === setting.product_id)?.stock ?? 0
        const delta = Number(setting.opening_qty) - current
        return delta === 0 ? [] : [{ product_id: setting.product_id, delta, reason: 'stock_base_diario', ref_type: 'daily_stock' }]
      })
      if (movements.length > 0) {
        const { error: resetError } = await supabase.from('stock_movements').insert(movements)
        if (resetError) setError(`No se pudo aplicar el stock diario: ${resetError.message}`)
      }
      await writeJsonSetting(supabase, DAILY_RUN_KEY, today)
      const { data: refreshedStock } = await supabase.from('product_stock').select('product_id, name, unit, stock').order('name')
      nextStock = (refreshedStock ?? []).map((row) => ({ id: row.product_id as string, name: row.name, unit: row.unit, stock: Number(row.stock) }))
    }

    setStock(nextStock)
    setProducts((productResult.data ?? []) as Product[])
    setSettings(storedSettings)
    setDrafts(Object.fromEntries(storedSettings.map((row) => [row.product_id, String(row.opening_qty)])))
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    fetchAll()
  }, [supabase, fetchAll])

  const settingByProduct = useMemo(
    () => new Map(settings.map((setting) => [setting.product_id, setting])),
    [settings]
  )

  const saveDailySetting = async (productId: string, enabled: boolean) => {
    const value = parseQty(drafts[productId] ?? '0')
    if (!Number.isFinite(value) || value < 0) return
    setSavingId(productId)
    setError('')
    const nextSettings = settings.some((setting) => setting.product_id === productId)
      ? settings.map((setting) => setting.product_id === productId ? { ...setting, opening_qty: value, enabled } : setting)
      : [...settings, { product_id: productId, opening_qty: value, enabled }]
    const saveError = await writeJsonSetting(supabase, DAILY_SETTINGS_KEY, nextSettings)
    if (saveError) setError(saveError)
    else {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Cordoba' }).format(new Date())
      await writeJsonSetting(supabase, DAILY_RUN_KEY, today)
      setMessage('Configuración diaria guardada. Se aplicará desde el próximo día.')
    }
    setSavingId(null)
    await fetchAll()
  }

  const applyToday = async (productId: string) => {
    setSavingId(productId)
    setError('')
    const setting = settings.find((item) => item.product_id === productId)
    const current = stock.find((row) => row.id === productId)?.stock ?? 0
    const delta = Number(setting?.opening_qty ?? 0) - current
    const { error: movementError } = delta === 0
      ? { error: null }
      : await supabase.from('stock_movements').insert({ product_id: productId, delta, reason: 'stock_base_diario', ref_type: 'daily_stock_manual', created_by: userId })
    if (movementError) setError(movementError.message)
    else setMessage('Stock base aplicado para hoy.')
    setSavingId(null)
    await fetchAll()
  }

  const afterSave = async () => {
    setModal(null)
    setLoading(true)
    setMessage('Movimiento registrado.')
    await fetchAll()
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Stock de venta</h1>
          <p className="font-body text-warm-gray mt-1">
            Solo productos terminados disponibles para el negocio. Los insumos se mantienen únicamente para costos y recetas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal('produccion')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border text-charcoal rounded-xl font-body text-sm font-semibold hover:bg-cream transition-colors shadow-sm">
            <Factory size={15} /> Registrar producción
          </button>
          <button onClick={() => setModal('disponible')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border text-charcoal rounded-xl font-body text-sm font-semibold hover:bg-cream transition-colors shadow-sm">
            <Flame size={15} /> Poner disponible
          </button>
          <button onClick={() => setModal('ajuste')} className="flex items-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md">
            <Plus size={15} /> Ajuste / merma
          </button>
        </div>
      </div>

      {message && <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">{message}</div>}
      {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-body text-sm">{error}</div>}

      <div className="mb-6 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Settings2 size={20} className="text-burgundy mt-0.5" />
          <div>
            <h2 className="font-sans font-bold text-charcoal">Stock base diario</h2>
            <p className="font-body text-sm text-warm-gray mt-1">
              Al comenzar un nuevo día, los productos habilitados vuelven a esta cantidad. “Aplicar hoy” reemplaza la existencia actual por la base configurada.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-cream-dark border-b border-border">
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Producto</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Disponible</th>
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Base diaria</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.filter((product) => product.active).map((product) => {
                const current = stock.find((row) => row.id === product.id)?.stock ?? 0
                const setting = settingByProduct.get(product.id)
                return (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-cream/30 transition-colors">
                    <td className="px-4 py-3 font-body text-sm font-semibold text-charcoal">
                      {product.name}
                      <div className="sm:hidden flex items-center gap-1 mt-2">
                        <input
                          type="number" min="0" step="any"
                          value={drafts[product.id] ?? ''}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [product.id]: event.target.value }))}
                          placeholder="Base diaria"
                          className="w-24 px-2 py-1.5 border border-border rounded-lg font-num text-xs focus:outline-none focus:border-burgundy"
                        />
                        <span className="font-body text-[11px] text-warm-gray">{product.unit}</span>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-num text-sm font-bold ${current < 0 ? 'text-red-600' : 'text-charcoal'}`}>
                      {fmtQty(current, product.unit)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" step="any"
                          value={drafts[product.id] ?? ''}
                          onChange={(event) => setDrafts((prev) => ({ ...prev, [product.id]: event.target.value }))}
                          placeholder="Sin configurar"
                          className="w-28 px-3 py-2 border border-border rounded-lg font-num text-sm focus:outline-none focus:border-burgundy"
                        />
                        <span className="font-body text-xs text-warm-gray">{product.unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => saveDailySetting(product.id, !(setting?.enabled ?? false))}
                          disabled={savingId === product.id}
                          className={`px-3 py-2 rounded-lg font-body text-xs font-semibold border transition-colors ${setting?.enabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-warm-gray border-border hover:text-charcoal'}`}
                        >
                          {setting?.enabled ? 'Activo' : 'Activar'}
                        </button>
                        <button onClick={() => saveDailySetting(product.id, setting?.enabled ?? true)} disabled={savingId === product.id} title="Guardar cantidad base" className="p-2 rounded-lg border border-border text-burgundy hover:bg-burgundy/10 disabled:opacity-50">
                          <Save size={15} />
                        </button>
                        {setting?.enabled && (
                          <button onClick={() => applyToday(product.id)} disabled={savingId === product.id} title="Aplicar la base configurada al stock de hoy" className="p-2 rounded-lg border border-border text-warm-gray hover:text-charcoal hover:bg-cream disabled:opacity-50">
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {products.filter((product) => product.active).length === 0 && <div className="text-center py-12 text-warm-gray font-body text-sm">No hay productos activos.</div>}
        </div>
      )}

      {modal === 'produccion' && <ProductionModal supabase={supabase} userId={userId} products={products} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal === 'disponible' && <AvailableModal supabase={supabase} userId={userId} products={products} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal === 'ajuste' && <AdjustmentModal supabase={supabase} userId={userId} products={products} onClose={() => setModal(null)} onSaved={afterSave} />}
    </div>
  )
}

type SB = ReturnType<typeof createClient>
const inputCls = 'px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white w-full'
const labelCls = 'font-body text-xs text-warm-gray uppercase tracking-wide'

function ModalShell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-white">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  )
}

function ProductionModal({ supabase, userId, products, onClose, onSaved }: { supabase: SB; userId: string | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const availableProducts = products.filter((product) => product.active)
  const [productId, setProductId] = useState(availableProducts[0]?.id ?? '')
  const [prepared, setPrepared] = useState('')
  const [available, setAvailable] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const product = products.find((item) => item.id === productId)
  const preparedQty = parseQty(prepared)
  const availableQty = parseQty(available)
  const valid = Boolean(productId && prepared !== '' && available !== '' && preparedQty >= 0 && availableQty >= 0 && availableQty <= preparedQty)

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    const detail = [`Disponible para venta: ${availableQty}`, notes.trim()].filter(Boolean).join(' · ')
    const { data: batch, error: batchError } = await supabase.from('production_batches').insert({
      product_id: productId,
      produced_qty: preparedQty,
      produced_by: userId,
      notes: detail || null,
    }).select('id').single()
    let movementError: { message: string } | null = null
    if (!batchError && availableQty > 0) {
      const result = await supabase.from('stock_movements').insert({
        product_id: productId,
        delta: availableQty,
        reason: 'produccion_disponible',
        ref_type: 'batch',
        ref_id: batch?.id ?? null,
        created_by: userId,
      })
      movementError = result.error
    }
    setSaving(false)
    if (batchError || movementError) setError(batchError?.message ?? movementError?.message ?? 'No se pudo registrar la producción.')
    else onSaved()
  }

  return (
    <ModalShell title="Registrar producción" icon={<Factory size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Producto</label>
        <select value={productId} onChange={(event) => setProductId(event.target.value)} className={inputCls}>
          {availableProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Total elaborado</label>
          <div className="relative">
            <input type="number" min="0" step="any" value={prepared} onChange={(event) => setPrepared(event.target.value)} className={`${inputCls} pr-16`} placeholder="Cantidad" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-warm-gray">{product?.unit}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Disponible para venta</label>
          <div className="relative">
            <input type="number" min="0" step="any" value={available} onChange={(event) => setAvailable(event.target.value)} className={`${inputCls} pr-16`} placeholder="Cantidad" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-warm-gray">{product?.unit}</span>
          </div>
        </div>
      </div>
      <p className="font-body text-xs text-warm-gray">Solo “disponible para venta” se suma al stock. Lo guardado o todavía sin cocinar queda fuera del mostrador.</p>
      {prepared !== '' && available !== '' && availableQty > preparedQty && <div className="flex items-center gap-2 text-red-600 font-body text-xs"><AlertTriangle size={14} /> Lo disponible no puede superar lo elaborado.</div>}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Notas (opcional)</label>
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className={inputCls} placeholder="Ej: el resto quedó guardado" />
      </div>
      {error && <p className="font-body text-sm text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !valid} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
        <Save size={16} /> {saving ? 'Guardando...' : 'Sumar disponibilidad'}
      </button>
    </ModalShell>
  )
}

function AvailableModal({ supabase, userId, products, onClose, onSaved }: { supabase: SB; userId: string | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const availableProducts = products.filter((product) => product.active)
  const [productId, setProductId] = useState(availableProducts[0]?.id ?? '')
  const [quantity, setQuantity] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const product = products.find((item) => item.id === productId)

  const save = async () => {
    const value = parseQty(quantity)
    if (!productId || !Number.isFinite(value) || value <= 0) return
    setSaving(true)
    setError('')
    const { error: insertError } = await supabase.from('stock_movements').insert({
      product_id: productId,
      delta: value,
      reason: 'puesto_disponible',
      ref_type: 'freezer_a_venta',
      created_by: userId,
    })
    setSaving(false)
    if (insertError) setError(insertError.message)
    else onSaved()
  }

  return (
    <ModalShell title="Poner producto disponible" icon={<Flame size={18} />} onClose={onClose}>
      <p className="font-body text-sm text-warm-gray">Usá esta opción cuando el producto ya estaba elaborado o congelado y ahora lo cocinaste o preparaste para vender. No registra una nueva producción.</p>
      <div className="flex flex-col gap-1"><label className={labelCls}>Producto</label><select value={productId} onChange={(event) => setProductId(event.target.value)} className={inputCls}>{availableProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="flex flex-col gap-1"><label className={labelCls}>Cantidad que queda disponible</label><div className="relative"><input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} className={`${inputCls} pr-16`} placeholder="Cantidad" /><span className="absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-warm-gray">{product?.unit}</span></div></div>
      {error && <p className="font-body text-sm text-red-600">{error}</p>}
      <button onClick={save} disabled={saving || !productId || !quantity} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50"><Save size={16} /> {saving ? 'Guardando...' : 'Sumar al disponible'}</button>
    </ModalShell>
  )
}

function AdjustmentModal({ supabase, userId, products, onClose, onSaved }: { supabase: SB; userId: string | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [id, setId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState<'ajuste' | 'merma'>('ajuste')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const value = parseQty(delta)
    if (!id || !value) return
    setSaving(true)
    await supabase.from('stock_movements').insert({ product_id: id, delta: value, reason, created_by: userId })
    onSaved()
  }

  return (
    <ModalShell title="Ajuste / merma de producto" icon={<Package size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Producto</label>
        <select value={id} onChange={(event) => setId(event.target.value)} className={inputCls}>
          <option value="">— Seleccionar —</option>
          {products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} ({product.unit})</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Cantidad (negativo para descontar)</label>
        <input type="number" step="any" value={delta} onChange={(event) => setDelta(event.target.value)} className={inputCls} placeholder="Ej: -2 o 5" />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Motivo</label>
        <select value={reason} onChange={(event) => setReason(event.target.value as 'ajuste' | 'merma')} className={inputCls}>
          <option value="ajuste">Ajuste de existencias</option>
          <option value="merma">Merma / descarte</option>
        </select>
      </div>
      <button onClick={save} disabled={saving || !id || !delta} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
        <Save size={16} /> Registrar movimiento
      </button>
    </ModalShell>
  )
}
