'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Package, Calculator, Plus, Pencil, Trash2, Save, X,
  TrendingUp, ChevronDown, ChevronRight, Search,
} from 'lucide-react'

interface RawMaterial {
  id: string
  name: string
  unit: string
  unit_price: number
  stock: number | null
  supplier: string | null
}

interface RecipeItem {
  id: string
  recipe_id: string
  raw_material_id: string
  quantity: number
  raw_material?: RawMaterial
}

interface Recipe {
  id: string
  product_id: string
  yield_qty: number
  markup_pct: number
  notes: string | null
  items: RecipeItem[]
}

interface Product {
  id: string
  name: string
  unit: string
  price: number | null
}

const UNITS = ['kg', 'gramo', 'litro', 'ml', 'unidad', 'docena']

export default function AdminCostsPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'materials' | 'recipes'>('materials')

  // Materials
  const [materials, setMaterials] = useState<RawMaterial[]>([])
  const [matLoading, setMatLoading] = useState(true)
  const [editingMat, setEditingMat] = useState<Partial<RawMaterial> | null>(null)
  const [isNewMat, setIsNewMat] = useState(false)
  const [matSearch, setMatSearch] = useState('')

  // Recipes
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [recLoading, setRecLoading] = useState(true)
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Partial<Recipe> | null>(null)
  const [recipeItems, setRecipeItems] = useState<Partial<RecipeItem>[]>([])
  const [isNewRecipe, setIsNewRecipe] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [productName, setProductName] = useState('')          // nombre del producto (permite crear al vuelo)
  const [saleMode, setSaleMode] = useState<'kg' | 'unidad'>('unidad') // modalidad de venta de la receta

  const fetchMaterials = useCallback(async () => {
    const { data } = await supabase.from('raw_materials').select('*').order('name')
    setMaterials(data ?? [])
    setMatLoading(false)
  }, [supabase])

  const fetchRecipes = useCallback(async () => {
    const [recRes, prodRes] = await Promise.all([
      supabase.from('recipes').select(`*, items:recipe_items(*, raw_material:raw_materials(*))`).order('created_at'),
      supabase.from('products').select('id, name, unit, price').order('name'),
    ])
    setRecipes((recRes.data ?? []) as Recipe[])
    setProducts((prodRes.data ?? []) as Product[])
    setRecLoading(false)
  }, [supabase])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])
  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  // ── Materials CRUD ────────────────────────────────────────────────────────────
  const openNewMat = () => {
    setEditingMat({ name: '', unit: 'kg', unit_price: 0, stock: null, supplier: '' })
    setIsNewMat(true)
  }
  const openEditMat = (m: RawMaterial) => { setEditingMat({ ...m }); setIsNewMat(false) }
  const closeMat = () => setEditingMat(null)

  const saveMat = async () => {
    if (!editingMat?.name) return
    if (isNewMat) {
      await supabase.from('raw_materials').insert({
        name: editingMat.name,
        unit: editingMat.unit,
        unit_price: editingMat.unit_price ?? 0,
        stock: editingMat.stock,
        supplier: editingMat.supplier,
      })
    } else {
      await supabase.from('raw_materials').update({
        name: editingMat.name,
        unit: editingMat.unit,
        unit_price: editingMat.unit_price ?? 0,
        stock: editingMat.stock,
        supplier: editingMat.supplier,
      }).eq('id', editingMat.id!)
    }
    await fetchMaterials()
    await fetchRecipes() // re-fetch recipes because costs change
    closeMat()
  }

  const deleteMat = async (id: string) => {
    if (!confirm('¿Eliminar esta materia prima?')) return
    await supabase.from('raw_materials').delete().eq('id', id)
    await fetchMaterials()
  }

  // ── Cost calculation ──────────────────────────────────────────────────────────
  const calcRecipeCost = (recipe: Recipe): number => {
    return (recipe.items ?? []).reduce((sum, item) => {
      const mat = item.raw_material
      if (!mat) return sum
      return sum + item.quantity * mat.unit_price
    }, 0)
  }

  const calcSuggestedPrice = (recipe: Recipe): number => {
    const cost = calcRecipeCost(recipe)
    const perUnit = recipe.yield_qty > 0 ? cost / recipe.yield_qty : cost
    return perUnit * (1 + recipe.markup_pct / 100)
  }

  // ── Recipes CRUD ──────────────────────────────────────────────────────────────
  const openNewRecipe = () => {
    // Ya no exige elegir un producto existente: se puede escribir uno nuevo.
    setEditingRecipe({
      product_id: '',
      yield_qty: 1,
      markup_pct: 250,
      notes: '',
    })
    setProductName('')
    setSaleMode('unidad')
    setRecipeItems([{ raw_material_id: '', quantity: 1 }])
    setIsNewRecipe(true)
  }

  const openEditRecipe = (r: Recipe) => {
    setEditingRecipe({ ...r })
    const prod = products.find(p => p.id === r.product_id)
    setProductName(prod?.name ?? '')
    setSaleMode(prod?.unit === 'kg' ? 'kg' : 'unidad')
    setRecipeItems(r.items.map(i => ({ ...i })))
    setIsNewRecipe(false)
  }

  const closeRecipe = () => setEditingRecipe(null)

  const addRecipeItem = () => setRecipeItems(prev => [...prev, { raw_material_id: '', quantity: 1 }])
  const removeRecipeItem = (idx: number) => setRecipeItems(prev => prev.filter((_, i) => i !== idx))
  const updateRecipeItem = (idx: number, field: string, value: string | number) => {
    setRecipeItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const saveRecipe = async () => {
    if (!editingRecipe) return

    // Resolver el producto: usar el existente o crearlo al vuelo por nombre.
    let productId = editingRecipe.product_id
    if (isNewRecipe) {
      const typed = productName.trim()
      const match = products.find(p => p.name.toLowerCase() === typed.toLowerCase())
      if (match) {
        productId = match.id
      } else {
        if (!typed) return  // sin nombre no se puede crear
        const { data: newProd } = await supabase.from('products').insert({
          name: typed,
          unit: saleMode,
          active: true,
        }).select().single()
        productId = newProd?.id
      }
    }
    if (!productId) return

    let recipeId = editingRecipe.id

    if (isNewRecipe) {
      const { data } = await supabase.from('recipes').insert({
        product_id: productId,
        yield_qty: editingRecipe.yield_qty ?? 1,
        markup_pct: editingRecipe.markup_pct ?? 250,
        notes: editingRecipe.notes,
      }).select().single()
      recipeId = data?.id
    } else {
      await supabase.from('recipes').update({
        product_id: productId,
        yield_qty: editingRecipe.yield_qty ?? 1,
        markup_pct: editingRecipe.markup_pct ?? 250,
        notes: editingRecipe.notes,
        updated_at: new Date().toISOString(),
      }).eq('id', recipeId!)
      await supabase.from('recipe_items').delete().eq('recipe_id', recipeId!)
    }

    const validItems = recipeItems.filter(i => i.raw_material_id && i.quantity)
    if (validItems.length > 0) {
      await supabase.from('recipe_items').insert(
        validItems.map(i => ({
          recipe_id: recipeId,
          raw_material_id: i.raw_material_id,
          quantity: i.quantity,
        }))
      )
    }

    // Calcula y actualiza el precio del producto principal:
    const finalCost = validItems.reduce((sum, item) => {
      const mat = materials.find(m => m.id === item.raw_material_id)
      if (!mat || !item.quantity) return sum
      return sum + item.quantity * mat.unit_price
    }, 0)
    
    const yieldQty = editingRecipe.yield_qty ?? 1
    const perUnit = yieldQty > 0 ? finalCost / yieldQty : finalCost
    const markup = editingRecipe.markup_pct ?? 250
    const suggestedPrice = perUnit * (1 + markup / 100)

    // Actualiza precio y modalidad (kg/unidad) del producto de forma coherente.
    await supabase.from('products').update({ price: suggestedPrice, unit: saleMode }).eq('id', productId)

    await fetchRecipes() // refresca también la lista de productos
    closeRecipe()
  }

  const deleteRecipe = async (id: string) => {
    if (!confirm('¿Eliminar esta receta?')) return
    await supabase.from('recipes').delete().eq('id', id)
    await fetchRecipes()
  }

  // ── Current recipe cost for the form preview ──────────────────────────────────
  const formCostPreview = () => {
    const cost = recipeItems.reduce((sum, item) => {
      const mat = materials.find(m => m.id === item.raw_material_id)
      if (!mat || !item.quantity) return sum
      return sum + item.quantity * mat.unit_price
    }, 0)
    const perUnit = (editingRecipe?.yield_qty ?? 1) > 0 ? cost / (editingRecipe?.yield_qty ?? 1) : cost
    const suggested = perUnit * (1 + (editingRecipe?.markup_pct ?? 250) / 100)
    return { cost, perUnit, suggested }
  }

  const fmtARS = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Calculadora de Costos</h1>
        <p className="font-body text-warm-gray mt-1">
          Gestioná materias primas, recetas y calculá precios de venta automáticamente.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-8 bg-white rounded-xl border border-border p-1 w-fit shadow-sm">
        <button
          onClick={() => setTab('materials')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-medium transition-all ${
            tab === 'materials' ? 'bg-burgundy text-cream shadow-sm' : 'text-warm-gray hover:text-charcoal'
          }`}
        >
          <Package size={16} /> Materias Primas
        </button>
        <button
          onClick={() => setTab('recipes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-medium transition-all ${
            tab === 'recipes' ? 'bg-burgundy text-cream shadow-sm' : 'text-warm-gray hover:text-charcoal'
          }`}
        >
          <Calculator size={16} /> Recetas y Precios
        </button>
      </div>

      {/* ── MATERIALS TAB ── */}
      {tab === 'materials' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" />
              <input
                type="text"
                value={matSearch}
                onChange={e => setMatSearch(e.target.value)}
                placeholder="Buscar materia prima o proveedor..."
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl font-body text-sm focus:outline-none focus:border-burgundy bg-white"
              />
            </div>
            <button
              onClick={openNewMat}
              className="flex items-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md whitespace-nowrap"
            >
              <Plus size={15} /> Nueva materia prima
            </button>
          </div>

          {/* Material form modal */}
          {editingMat && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <h2 className="font-sans text-lg font-bold text-charcoal">
                    {isNewMat ? 'Nueva Materia Prima' : 'Editar Materia Prima'}
                  </h2>
                  <button onClick={closeMat} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
                </div>
                <div className="p-6 flex flex-col gap-4">
                  {[
                    { field: 'name', label: 'Nombre *', type: 'text', placeholder: 'Ej: Harina 000' },
                    { field: 'supplier', label: 'Proveedor', type: 'text', placeholder: 'Ej: Molinos Cañuelas' },
                    { field: 'unit_price', label: 'Precio por unidad (ARS)', type: 'number', placeholder: '0' },
                    { field: 'stock', label: 'Stock disponible', type: 'number', placeholder: '0' },
                  ].map(({ field, label, type, placeholder }) => (
                    <div key={field} className="flex flex-col gap-1">
                      <label className="font-body text-xs text-warm-gray uppercase tracking-wide">{label}</label>
                      <input
                        type={type}
                        value={(editingMat[field as keyof RawMaterial] as string | number) ?? ''}
                        onChange={e => setEditingMat(prev => ({
                          ...prev!,
                          [field]: type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value,
                        }))}
                        placeholder={placeholder}
                        min={type === 'number' ? 0 : undefined}
                        step={type === 'number' ? 'any' : undefined}
                        className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                      />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1">
                    <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Unidad de compra</label>
                    <select
                      value={editingMat.unit ?? 'kg'}
                      onChange={e => setEditingMat(prev => ({ ...prev!, unit: e.target.value }))}
                      className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white"
                    >
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={saveMat}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors">
                      <Save size={15} /> Guardar
                    </button>
                    <button onClick={closeMat}
                      className="px-4 py-3 border border-border text-warm-gray rounded-xl font-body text-sm hover:text-charcoal transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {matLoading ? (
            <div className="text-center py-12 text-warm-gray font-body">Cargando...</div>
          ) : (
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-cream-dark border-b border-border">
                    <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Ingrediente</th>
                    <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Proveedor</th>
                    <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Precio / Unidad</th>
                    <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden md:table-cell">Stock</th>
                    <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {materials
                    .filter(m => `${m.name} ${m.supplier ?? ''}`.toLowerCase().includes(matSearch.toLowerCase()))
                    .map((m) => (
                    <tr key={m.id} className="border-b border-border/50 hover:bg-cream/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-body text-sm font-semibold text-charcoal">{m.name}</div>
                        <div className="font-body text-xs text-warm-gray">{m.unit}</div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell font-body text-sm text-warm-gray">{m.supplier ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-body text-sm font-bold text-burgundy">{fmtARS(m.unit_price)}</span>
                        <span className="font-body text-xs text-warm-gray ml-1">/ {m.unit}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-body text-sm text-warm-gray">
                        {m.stock !== null ? `${m.stock} ${m.unit}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditMat(m)}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-burgundy hover:bg-burgundy/10 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => deleteMat(m.id)}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {materials.length === 0 && (
                <div className="text-center py-12 text-warm-gray font-body text-sm">No hay materias primas. Agregá la primera.</div>
              )}
              {materials.length > 0 && materials.filter(m => `${m.name} ${m.supplier ?? ''}`.toLowerCase().includes(matSearch.toLowerCase())).length === 0 && (
                <div className="text-center py-12 text-warm-gray font-body text-sm">Sin resultados para “{matSearch}”.</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── RECIPES TAB ── */}
      {tab === 'recipes' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" />
              <input
                type="text"
                value={recipeSearch}
                onChange={e => setRecipeSearch(e.target.value)}
                placeholder="Buscar producto o receta..."
                className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl font-body text-sm focus:outline-none focus:border-burgundy bg-white"
              />
            </div>
            <button
              onClick={openNewRecipe}
              className="flex items-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md whitespace-nowrap"
            >
              <Plus size={15} /> Nueva receta
            </button>
          </div>

          {/* Recipe form modal */}
          {editingRecipe && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-white z-10">
                  <h2 className="font-sans text-lg font-bold text-charcoal">
                    {isNewRecipe ? 'Nueva Receta' : 'Editar Receta'}
                  </h2>
                  <button onClick={closeRecipe} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
                </div>
                <div className="p-6 flex flex-col gap-5">
                  {/* Producto (permite escribir uno nuevo) */}
                  <div className="flex flex-col gap-1">
                    <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Producto</label>
                    <input
                      list="rec-products"
                      value={productName}
                      onChange={e => {
                        const val = e.target.value
                        setProductName(val)
                        const match = products.find(p => p.name.toLowerCase() === val.trim().toLowerCase())
                        setEditingRecipe(prev => ({ ...prev!, product_id: match ? match.id : '' }))
                      }}
                      disabled={!isNewRecipe}
                      placeholder="Escribí el nombre (si no existe, se crea)"
                      className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white disabled:opacity-60"
                    />
                    <datalist id="rec-products">
                      {products.map(p => <option key={p.id} value={p.name} />)}
                    </datalist>
                    {isNewRecipe && productName.trim() && !products.some(p => p.name.toLowerCase() === productName.trim().toLowerCase()) && (
                      <span className="font-body text-xs text-burgundy">Se creará el producto “{productName.trim()}”.</span>
                    )}
                  </div>

                  {/* Modalidad de venta */}
                  <div className="flex flex-col gap-1">
                    <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Se vende por</label>
                    <div className="flex gap-2">
                      {(['kg', 'unidad'] as const).map(mode => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSaleMode(mode)}
                          className={`flex-1 px-4 py-2.5 rounded-lg font-body text-sm font-medium transition-colors border ${
                            saleMode === mode
                              ? 'bg-burgundy text-cream border-burgundy'
                              : 'bg-white text-warm-gray border-border hover:text-charcoal'
                          }`}
                        >
                          {mode === 'kg' ? 'Kilo' : 'Unidad'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Rinde + margen */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="font-body text-xs text-warm-gray uppercase tracking-wide">
                        {saleMode === 'kg' ? 'Rinde (kg)' : 'Rinde (unidades)'}
                      </label>
                      <input type="number" min="0.001" step="any"
                        value={editingRecipe.yield_qty ?? 1}
                        onChange={e => setEditingRecipe(prev => ({ ...prev!, yield_qty: Number(e.target.value) }))}
                        className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Margen (%)</label>
                      <input type="number" min="0" step="1"
                        value={editingRecipe.markup_pct ?? 250}
                        onChange={e => setEditingRecipe(prev => ({ ...prev!, markup_pct: Number(e.target.value) }))}
                        className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy" />
                    </div>
                  </div>

                  {/* Ingredients */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Ingredientes</label>
                      <button onClick={addRecipeItem}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-body font-semibold text-burgundy bg-burgundy/10 hover:bg-burgundy hover:text-cream rounded-lg transition-colors">
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {recipeItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={item.raw_material_id ?? ''}
                            onChange={e => updateRecipeItem(idx, 'raw_material_id', e.target.value)}
                            className="flex-1 px-3 py-2 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white"
                          >
                            <option value="">— Seleccionar —</option>
                            {materials.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                            ))}
                          </select>
                          <input
                            type="number" min="0" step="any"
                            value={item.quantity ?? ''}
                            onChange={e => updateRecipeItem(idx, 'quantity', Number(e.target.value))}
                            placeholder="Cant."
                            className="w-24 px-3 py-2 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                          />
                          <button onClick={() => removeRecipeItem(idx)}
                            className="p-2 text-warm-gray hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live cost preview */}
                  {(() => {
                    const { cost, perUnit, suggested } = formCostPreview()
                    return (
                      <div className="bg-cream-dark rounded-xl p-4 grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="font-body text-xs text-warm-gray uppercase tracking-wide mb-1">Costo total receta</div>
                          <div className="font-sans text-lg font-bold text-charcoal">{fmtARS(cost)}</div>
                        </div>
                        <div>
                          <div className="font-body text-xs text-warm-gray uppercase tracking-wide mb-1">Costo por unidad</div>
                          <div className="font-sans text-lg font-bold text-charcoal">{fmtARS(perUnit)}</div>
                        </div>
                        <div>
                          <div className="font-body text-xs text-warm-gray uppercase tracking-wide mb-1">Precio sugerido / {saleMode === 'kg' ? 'kg' : 'unidad'}</div>
                          <div className="font-sans text-lg font-bold text-burgundy">{fmtARS(suggested)}</div>
                        </div>
                      </div>
                    )
                  })()}

                  <div className="flex flex-col gap-1">
                    <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Notas</label>
                    <textarea
                      value={editingRecipe.notes ?? ''}
                      onChange={e => setEditingRecipe(prev => ({ ...prev!, notes: e.target.value }))}
                      rows={2}
                      placeholder="Observaciones opcionales..."
                      className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={saveRecipe}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors">
                      <Save size={15} /> Guardar Receta
                    </button>
                    <button onClick={closeRecipe}
                      className="px-4 py-3 border border-border text-warm-gray rounded-xl font-body text-sm hover:text-charcoal transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {recLoading ? (
            <div className="text-center py-12 text-warm-gray font-body">Cargando...</div>
          ) : (
            <div className="flex flex-col gap-4">
              {recipes
                .filter((recipe) => {
                  const p = products.find(pp => pp.id === recipe.product_id)
                  return (p?.name ?? '').toLowerCase().includes(recipeSearch.toLowerCase())
                })
                .map((recipe) => {
                const product = products.find(p => p.id === recipe.product_id)
                const costTotal = calcRecipeCost(recipe)
                const costPerUnit = recipe.yield_qty > 0 ? costTotal / recipe.yield_qty : costTotal
                const suggested = calcSuggestedPrice(recipe)
                const expanded = expandedRecipe === recipe.id

                return (
                  <div key={recipe.id} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                    <div
                      className="flex items-center justify-between p-5 cursor-pointer hover:bg-cream/50 transition-colors"
                      onClick={() => setExpandedRecipe(expanded ? null : recipe.id)}
                    >
                      <div className="flex items-center gap-3">
                        {expanded ? <ChevronDown size={18} className="text-warm-gray" /> : <ChevronRight size={18} className="text-warm-gray" />}
                        <div>
                          <div className="font-body font-semibold text-charcoal">{product?.name ?? 'Producto eliminado'}</div>
                          <div className="font-body text-xs text-warm-gray mt-0.5">
                            Rinde {recipe.yield_qty} {product?.unit ?? 'und'} · Margen {recipe.markup_pct}%
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                          <div className="font-body text-xs text-warm-gray">Costo/unidad</div>
                          <div className="font-body text-sm font-semibold text-charcoal">{fmtARS(costPerUnit)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-body text-xs text-warm-gray flex items-center gap-1"><TrendingUp size={11} /> Precio sugerido</div>
                          <div className="font-body text-base font-bold text-burgundy">{fmtARS(suggested)}</div>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditRecipe(recipe) }}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-burgundy hover:bg-burgundy/10 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteRecipe(recipe.id) }}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-border px-5 pb-5 pt-4">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left">
                              <th className="font-body text-xs text-warm-gray uppercase tracking-wide pb-2">Ingrediente</th>
                              <th className="font-body text-xs text-warm-gray uppercase tracking-wide pb-2">Cantidad</th>
                              <th className="font-body text-xs text-warm-gray uppercase tracking-wide pb-2">Precio unit.</th>
                              <th className="font-body text-xs text-warm-gray uppercase tracking-wide pb-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recipe.items.map(item => (
                              <tr key={item.id} className="border-t border-border/40">
                                <td className="py-2 font-body text-sm text-charcoal">{item.raw_material?.name ?? '—'}</td>
                                <td className="py-2 font-body text-sm text-warm-gray">{item.quantity} {item.raw_material?.unit}</td>
                                <td className="py-2 font-body text-sm text-warm-gray">{item.raw_material ? fmtARS(item.raw_material.unit_price) : '—'}</td>
                                <td className="py-2 font-body text-sm font-semibold text-charcoal text-right">
                                  {item.raw_material ? fmtARS(item.quantity * item.raw_material.unit_price) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-border">
                              <td colSpan={3} className="pt-2 font-body text-sm font-semibold text-charcoal">Total receta</td>
                              <td className="pt-2 font-body text-sm font-bold text-charcoal text-right">{fmtARS(costTotal)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} className="py-1 font-body text-sm text-warm-gray">Costo por unidad producida</td>
                              <td className="py-1 font-body text-sm font-semibold text-warm-gray text-right">{fmtARS(costPerUnit)}</td>
                            </tr>
                            <tr>
                              <td colSpan={3} className="py-1 font-body text-sm font-semibold text-burgundy">
                                Precio de venta sugerido (+{recipe.markup_pct}%)
                              </td>
                              <td className="py-1 font-body text-base font-bold text-burgundy text-right">{fmtARS(suggested)}</td>
                            </tr>
                          </tfoot>
                        </table>
                        {recipe.notes && (
                          <p className="mt-3 font-body text-xs text-warm-gray italic border-t border-border pt-3">{recipe.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {recipes.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-border font-body text-warm-gray text-sm">
                  No hay recetas. Creá la primera.
                </div>
              )}
              {recipes.length > 0 && recipes.filter((recipe) => {
                const p = products.find(pp => pp.id === recipe.product_id)
                return (p?.name ?? '').toLowerCase().includes(recipeSearch.toLowerCase())
              }).length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl border border-border font-body text-warm-gray text-sm">
                  Sin resultados para “{recipeSearch}”.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
