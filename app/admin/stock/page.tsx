'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Boxes, Package, Plus, X, AlertTriangle, Factory, ShoppingBasket, Save, Scale } from 'lucide-react'

interface StockRow { id: string; name: string; unit: string; min_stock: number | null; stock: number }
interface RawMaterial { id: string; name: string; unit: string }
interface RecipeItem { raw_material_id: string; quantity: number; raw_material?: { name: string; unit: string } }
interface Recipe { id: string; product_id: string; yield_qty: number; items: RecipeItem[] }
interface Product { id: string; name: string; unit: string }

type Modal = null | 'compra' | 'produccion' | 'ajuste'

export default function StockPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [tab, setTab] = useState<'insumos' | 'productos'>('insumos')
  const [rawStock, setRawStock] = useState<StockRow[]>([])
  const [prodStock, setProdStock] = useState<StockRow[]>([])
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)

  const fetchAll = useCallback(async () => {
    const [{ data: rs }, { data: ps }, { data: rms }, { data: prods }, { data: recs }] = await Promise.all([
      supabase.from('raw_material_stock').select('raw_material_id, name, unit, min_stock, stock').order('name'),
      supabase.from('product_stock').select('product_id, name, unit, min_stock, stock').order('name'),
      supabase.from('raw_materials').select('id, name, unit').order('name'),
      supabase.from('products').select('id, name, unit').order('name'),
      supabase.from('recipes').select('id, product_id, yield_qty, items:recipe_items(raw_material_id, quantity, raw_material:raw_materials(name, unit))'),
    ])
    setRawStock((rs ?? []).map((r) => ({ id: r.raw_material_id as string, name: r.name, unit: r.unit, min_stock: r.min_stock, stock: Number(r.stock) })))
    setProdStock((ps ?? []).map((r) => ({ id: r.product_id as string, name: r.name, unit: r.unit, min_stock: r.min_stock, stock: Number(r.stock) })))
    setRawMaterials((rms ?? []) as RawMaterial[])
    setProducts((prods ?? []) as Product[])
    setRecipes((recs ?? []) as unknown as Recipe[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    fetchAll()
  }, [supabase, fetchAll])

  const fmtQty = (n: number, unit: string) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit}`
  const lowRaw = rawStock.filter((r) => r.min_stock != null && r.stock <= (r.min_stock as number))
  const lowProd = prodStock.filter((r) => r.min_stock != null && r.stock <= (r.min_stock as number))
  const rows = tab === 'insumos' ? rawStock : prodStock
  const lowAll = [...lowRaw, ...lowProd]

  const afterSave = async () => { setModal(null); setLoading(true); await fetchAll() }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Stock</h1>
          <p className="font-body text-warm-gray mt-1">Insumos, producción y existencias.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setModal('compra')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border text-charcoal rounded-xl font-body text-sm font-semibold hover:bg-cream transition-colors shadow-sm">
            <ShoppingBasket size={15} /> Compra de insumo
          </button>
          <button onClick={() => setModal('produccion')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border text-charcoal rounded-xl font-body text-sm font-semibold hover:bg-cream transition-colors shadow-sm">
            <Factory size={15} /> Producción
          </button>
          <button onClick={() => setModal('ajuste')} className="flex items-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md">
            <Plus size={15} /> Ajuste / merma
          </button>
        </div>
      </div>

      {lowAll.length > 0 && (
        <div className="mb-5 flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-body text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Stock bajo: </span>
            {lowAll.map((r) => r.name).join(', ')}.
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-5 bg-white rounded-xl border border-border p-1 w-fit shadow-sm">
        <button onClick={() => setTab('insumos')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-medium transition-all ${tab === 'insumos' ? 'bg-burgundy text-cream shadow-sm' : 'text-warm-gray hover:text-charcoal'}`}>
          <Boxes size={16} /> Insumos
        </button>
        <button onClick={() => setTab('productos')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-medium transition-all ${tab === 'productos' ? 'bg-burgundy text-cream shadow-sm' : 'text-warm-gray hover:text-charcoal'}`}>
          <Package size={16} /> Productos
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-cream-dark border-b border-border">
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">{tab === 'insumos' ? 'Insumo' : 'Producto'}</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Stock actual</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Mínimo</th>
                <th className="text-center px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const low = r.min_stock != null && r.stock <= (r.min_stock as number)
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-cream/40 transition-colors">
                    <td className="px-4 py-3 font-body text-sm font-semibold text-charcoal">{r.name}</td>
                    <td className={`px-4 py-3 text-right font-body text-sm font-bold ${r.stock < 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmtQty(r.stock, r.unit)}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell font-body text-sm text-warm-gray">{r.min_stock != null ? fmtQty(r.min_stock as number, r.unit) : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {low ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-body text-xs font-medium"><AlertTriangle size={11} /> Bajo</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-body text-xs font-medium">OK</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="text-center py-12 text-warm-gray font-body text-sm">Nada para mostrar.</div>}
        </div>
      )}

      {modal === 'compra' && <CompraModal supabase={supabase} userId={userId} rawMaterials={rawMaterials} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal === 'produccion' && <ProduccionModal supabase={supabase} products={products} recipes={recipes} onClose={() => setModal(null)} onSaved={afterSave} />}
      {modal === 'ajuste' && <AjusteModal supabase={supabase} userId={userId} rawMaterials={rawMaterials} products={products} onClose={() => setModal(null)} onSaved={afterSave} />}
    </div>
  )
}

type SB = ReturnType<typeof createClient>
const inputCls = 'px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white w-full'
const labelCls = 'font-body text-xs text-warm-gray uppercase tracking-wide'

function Shell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-white">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">{children}</div>
      </div>
    </div>
  )
}

function CompraModal({ supabase, userId, rawMaterials, onClose, onSaved }: { supabase: SB; userId: string | null; rawMaterials: RawMaterial[]; onClose: () => void; onSaved: () => void }) {
  const [id, setId] = useState('')
  const [qty, setQty] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const q = Number(qty.replace(',', '.'))
    if (!id || !q) return
    setSaving(true)
    await supabase.from('stock_movements').insert({ raw_material_id: id, delta: q, reason: 'compra', created_by: userId })
    onSaved()
  }
  return (
    <Shell title="Compra de insumo" icon={<ShoppingBasket size={18} />} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Insumo</label>
        <select value={id} onChange={(e) => setId(e.target.value)} className={inputCls}>
          <option value="">— Seleccionar —</option>
          {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Cantidad que entra</label>
        <input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="0" />
      </div>
      <button onClick={save} disabled={saving || !id || !qty} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
        <Save size={16} /> Registrar entrada
      </button>
    </Shell>
  )
}

function ProduccionModal({ supabase, products, recipes, onClose, onSaved }: { supabase: SB; products: Product[]; recipes: Recipe[]; onClose: () => void; onSaved: () => void }) {
  const withRecipe = products.filter((p) => recipes.some((r) => r.product_id === p.id))
  const [productId, setProductId] = useState(withRecipe[0]?.id ?? '')
  const [batches, setBatches] = useState('1')
  const [saving, setSaving] = useState(false)
  const recipe = recipes.find((r) => r.product_id === productId)
  const n = Number(batches.replace(',', '.')) || 0
  const addQty = recipe ? recipe.yield_qty * n : 0
  const product = products.find((p) => p.id === productId)

  const save = async () => {
    if (!recipe || n <= 0) return
    setSaving(true)
    const items = recipe.items.map((it) => ({ raw_material_id: it.raw_material_id, quantity: it.quantity * n }))
    await supabase.rpc('register_production', {
      p_product_id: productId,
      p_add_qty: addQty,
      p_items: items,
      p_notes: `${n} tanda(s)`,
    })
    onSaved()
  }

  return (
    <Shell title="Registrar producción" icon={<Factory size={18} />} onClose={onClose}>
      {withRecipe.length === 0 ? (
        <p className="font-body text-sm text-warm-gray">No hay productos con receta. Cargá una receta en la Calculadora de Costos primero.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Producto</label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={inputCls}>
              {withRecipe.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Cantidad de tandas (recetas)</label>
            <input type="number" min="0" step="any" value={batches} onChange={(e) => setBatches(e.target.value)} className={inputCls} />
          </div>
          {recipe && (
            <div className="bg-cream-dark rounded-xl p-3 text-sm font-body">
              <div className="flex justify-between font-semibold text-charcoal mb-1">
                <span>Produce</span><span>{addQty.toLocaleString('es-AR', { maximumFractionDigits: 3 })} {product?.unit}</span>
              </div>
              <div className="text-warm-gray text-xs mb-1">Consume:</div>
              {recipe.items.map((it, i) => (
                <div key={i} className="flex justify-between text-warm-gray text-xs">
                  <span>{it.raw_material?.name ?? 'insumo'}</span>
                  <span>{(it.quantity * n).toLocaleString('es-AR', { maximumFractionDigits: 3 })} {it.raw_material?.unit}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={save} disabled={saving || n <= 0} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
            <Save size={16} /> Registrar producción
          </button>
        </>
      )}
    </Shell>
  )
}

function AjusteModal({ supabase, userId, rawMaterials, products, onClose, onSaved }: { supabase: SB; userId: string | null; rawMaterials: RawMaterial[]; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState<'insumo' | 'producto'>('insumo')
  const [id, setId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState<'ajuste' | 'merma'>('ajuste')
  const [saving, setSaving] = useState(false)
  const list = tipo === 'insumo' ? rawMaterials : products
  const save = async () => {
    const d = Number(delta.replace(',', '.'))
    if (!id || !d) return
    setSaving(true)
    const row: Record<string, unknown> = { delta: d, reason, created_by: userId }
    if (tipo === 'insumo') row.raw_material_id = id; else row.product_id = id
    await supabase.from('stock_movements').insert(row)
    onSaved()
  }
  return (
    <Shell title="Ajuste / merma" icon={<Scale size={18} />} onClose={onClose}>
      <div className="flex gap-2">
        {(['insumo', 'producto'] as const).map((t) => (
          <button key={t} onClick={() => { setTipo(t); setId('') }} className={`flex-1 px-3 py-2 rounded-lg font-body text-sm border ${tipo === t ? 'bg-burgundy text-cream border-burgundy' : 'bg-white text-warm-gray border-border'}`}>
            {t === 'insumo' ? 'Insumo' : 'Producto'}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>{tipo === 'insumo' ? 'Insumo' : 'Producto'}</label>
        <select value={id} onChange={(e) => setId(e.target.value)} className={inputCls}>
          <option value="">— Seleccionar —</option>
          {list.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Cantidad (usá negativo para descontar)</label>
        <input type="number" step="any" value={delta} onChange={(e) => setDelta(e.target.value)} className={inputCls} placeholder="Ej: -2 o 5" />
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Motivo</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as 'ajuste' | 'merma')} className={inputCls}>
          <option value="ajuste">Ajuste de inventario</option>
          <option value="merma">Merma / descarte</option>
        </select>
      </div>
      <button onClick={save} disabled={saving || !id || !delta} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
        <Save size={16} /> Registrar movimiento
      </button>
    </Shell>
  )
}
