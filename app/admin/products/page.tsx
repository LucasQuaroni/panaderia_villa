'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, Plus, Pencil, Trash2, Star, RotateCcw, Save, X, Search } from 'lucide-react'
import { roundUpTo100 } from '@/lib/money'

interface SaleOption {
  label: string
  quantity: number
  price?: number | null
}

interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  manual_price: boolean
  unit: string
  sale_options: SaleOption[]
  category: string | null
  image_url: string | null
  featured: boolean
  active: boolean
  sort_order: number
}

type ProductForm = Omit<Product, 'id'>

const UNITS = ['unidad', 'kg', 'docena', 'porción', '1/2 kg', '100g']
const CATEGORIES = ['Panes', 'Facturas', 'Tortas', 'Especiales', 'Bebidas', 'Otros']
const CATALOG_NORMALIZED_KEY = 'catalog_normalized_v1'

const emptyProduct: ProductForm = {
  name: '',
  description: '',
  price: null,
  manual_price: true,
  unit: 'unidad',
  sale_options: [
    { label: 'Unidad', quantity: 1 },
    { label: 'Media docena', quantity: 6 },
    { label: 'Docena', quantity: 12 },
  ],
  category: 'Panes',
  image_url: '',
  featured: false,
  active: true,
  sort_order: 0,
}

export default function AdminProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyProduct)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteSalesCount, setDeleteSalesCount] = useState(0)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [actionMessage, setActionMessage] = useState('')

  // Sube la imagen a Supabase Storage y guarda solo el enlace (ya no base64).
  const handleImageUpload = async (file: File) => {
    setImageError('')
    setUploadingImage(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) throw error
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setForm((prev) => ({ ...prev, image_url: data.publicUrl }))
    } catch (err) {
      console.error('[upload imagen]', err)
      setImageError('No se pudo subir la imagen. Verificá tus permisos e intentá de nuevo.')
    } finally {
      setUploadingImage(false)
    }
  }

  // Categorías dinámicas
  const [categories, setCategories] = useState<string[]>(CATEGORIES)
  const [manageCats, setManageCats] = useState(false)
  const [newCat, setNewCat] = useState('')

  const fetchProducts = async () => {
    const [prodRes, catRes] = await Promise.all([
      supabase.from('products').select('*').order('sort_order'),
      supabase.from('site_content').select('value').eq('key', 'product_categories').single()
    ])
    setProducts(prodRes.data ?? [])
    if (catRes.data) {
      try { setCategories(JSON.parse(catRes.data.value)) } catch {}
    }
    setLoading(false)
  }

  const saveCategories = async (cats: string[]) => {
    await supabase.from('site_content').upsert({ key: 'product_categories', value: JSON.stringify(cats) })
    setCategories(cats)
  }

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    await saveCategories([...categories, newCat.trim()])
    setNewCat('')
  }

  const deleteCategory = async (cat: string) => {
    if (!confirm(`¿Eliminar la categoría "${cat}"?`)) return
    await saveCategories(categories.filter(c => c !== cat))
  }

  useEffect(() => {
    const initializeCatalog = async () => {
      // Corre una sola vez usando tablas/campos existentes: los productos
      // históricos sin categoría quedan vigentes.
      const { data: marker } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', CATALOG_NORMALIZED_KEY)
        .maybeSingle()

      if (!marker) {
        const { data: existingProducts, error: readError } = await supabase
          .from('products')
          .select('id, category')

        if (!readError) {
          const updates = (existingProducts ?? []).map((product) => {
            const changes: { active?: boolean } = {}
            if (!product.category?.trim()) changes.active = true
            return Object.keys(changes).length > 0
              ? supabase.from('products').update(changes).eq('id', product.id)
              : Promise.resolve({ error: null })
          })
          const results = await Promise.all(updates)
          if (results.every((result) => !result.error)) {
            await supabase.from('site_content').upsert({ key: CATALOG_NORMALIZED_KEY, value: new Date().toISOString() })
          }
        }
      }

      await fetchProducts()
    }

    void initializeCatalog()
    // Se inicializa una sola vez al entrar a la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openNew = () => {
    setForm(emptyProduct)
    setEditingId('new')
  }

  const openEdit = (p: Product) => {
    const { id, ...rest } = p
    setForm({
      ...rest,
      manual_price: p.manual_price ?? false,
      sale_options: Array.isArray(p.sale_options) && p.sale_options.length > 0
        ? p.sale_options
        : p.unit === 'unidad'
          ? emptyProduct.sale_options.map((option) => ({ ...option }))
          : [],
    })
    setEditingId(id)
  }

  const closeForm = () => { setEditingId(null) }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'price' || name === 'sort_order') ? (value === '' ? null : Number(value)) : value,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      ...form,
      price: form.price === null ? null : roundUpTo100(Number(form.price)),
      sale_options: form.unit === 'kg'
        ? []
        : form.sale_options
            .map((option) => ({
              label: option.label.trim(),
              quantity: Number(option.quantity),
              price: option.price === null || option.price === undefined || Number(option.price) <= 0
                ? null
                : roundUpTo100(Number(option.price)),
            }))
            .filter((option) => option.label && Number.isFinite(option.quantity) && option.quantity > 0),
    }
    if (editingId === 'new') {
      await supabase.from('products').insert(payload)
    } else {
      await supabase.from('products').update(payload).eq('id', editingId)
    }
    await fetchProducts()
    setSaving(false)
    closeForm()
  }

  const openDeleteDialog = async (product: Product) => {
    setDeleteTarget(product)
    setDeleteSalesCount(0)
    setDeleteError('')
    setCheckingDelete(true)

    const retailResult = await supabase.from('sale_items').select('sale_id').eq('product_id', product.id)

    if (retailResult.error) {
      setDeleteError(`No se pudieron consultar las ventas: ${retailResult.error.message}`)
    } else {
      const saleIds = new Set<string>()
      for (const row of retailResult.data ?? []) saleIds.add(String(row.sale_id))
      setDeleteSalesCount(saleIds.size)
    }
    setCheckingDelete(false)
  }

  const closeDeleteDialog = () => {
    if (deleting) return
    setDeleteTarget(null)
    setDeleteError('')
  }

  const handleDelete = async () => {
    if (!deleteTarget || checkingDelete) return
    setDeleting(true)
    setDeleteError('')
    // Baja lógica sobre el campo que ya existe. Nunca se borra el registro,
    // por lo que las ventas asociadas conservan intacta su referencia.
    const { error } = await supabase
      .from('products')
      .update({ active: false, featured: false })
      .eq('id', deleteTarget.id)
    if (error) {
      setDeleteError(`No se pudo dar de baja el producto: ${error.message}`)
      setDeleting(false)
      return
    }
    await fetchProducts()
    setDeleting(false)
    setDeleteTarget(null)
    setActionMessage('Producto dado de baja. Las ventas y demás registros históricos se conservaron.')
  }

  const restoreProduct = async (product: Product) => {
    const { error } = await supabase.from('products').update({ active: true }).eq('id', product.id)
    if (error) {
      setActionMessage(`No se pudo restaurar: ${error.message}`)
      return
    }
    setActionMessage(`“${product.name}” fue restaurado.`)
    await fetchProducts()
  }

  const toggleFeatured = async (p: Product) => {
    await supabase.from('products').update({ featured: !p.featured }).eq('id', p.id)
    await fetchProducts()
  }

  const displayedProducts = products.filter((product) => {
    const matchesState = showDeleted ? !product.active : product.active
    const matchesSearch = `${product.name} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase().includes(search.toLowerCase())
    return matchesState && matchesSearch
  })
  const deletedCount = products.filter((product) => !product.active).length

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Productos</h1>
          <p className="font-body text-warm-gray mt-1">Gestioná el catálogo. Los productos de reventa se pueden crear acá sin receta.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDeleted((value) => !value)}
            className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl font-body text-sm font-semibold transition-colors shadow-sm ${showDeleted ? 'bg-charcoal text-cream border-charcoal' : 'bg-white text-charcoal border-border hover:bg-cream'}`}
          >
            <RotateCcw size={15} /> {showDeleted ? 'Ver vigentes' : `Dados de baja (${deletedCount})`}
          </button>
          <button
            onClick={() => setManageCats(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-charcoal border border-border rounded-xl font-body text-sm font-semibold hover:bg-cream transition-colors shadow-sm"
          >
            Categorías
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md"
          >
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">
          {actionMessage}
        </div>
      )}

      {/* Modal Categorías */}
      {manageCats && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-sans text-xl font-bold text-charcoal">Categorías</h2>
              <button onClick={() => setManageCats(false)} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <form onSubmit={addCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCat}
                  onChange={e => setNewCat(e.target.value)}
                  placeholder="Nueva categoría..."
                  className="flex-1 px-3 py-2 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                />
                <button type="submit" className="px-3 py-2 bg-burgundy text-cream rounded-lg font-body text-sm hover:bg-burgundy-dark transition-colors">
                  Añadir
                </button>
              </form>
              <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-2">
                {categories.map(c => (
                  <div key={c} className="flex items-center justify-between p-3 border border-border rounded-xl font-body text-sm text-charcoal bg-white">
                    {c}
                    <button onClick={() => deleteCategory(c)} className="text-warm-gray hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && <div className="text-center font-body text-sm text-warm-gray py-4">No hay categorías.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación de eliminación con revisión de ventas */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={closeDeleteDialog}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" /> Dar de baja producto
              </h2>
              <button onClick={closeDeleteDialog} disabled={deleting} className="text-warm-gray hover:text-charcoal disabled:opacity-40"><X size={20} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {checkingDelete ? (
                <div className="py-6 text-center font-body text-sm text-warm-gray">Revisando ventas asociadas...</div>
              ) : (
                <>
                  <div>
                    <p className="font-body text-sm text-charcoal">
                      Vas a dar de baja <span className="font-semibold">“{deleteTarget.name}”</span>.
                    </p>
                    {deleteSalesCount > 0 ? (
                      <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
                        <p className="font-body text-sm font-bold">¿Estás seguro? Darás de baja un producto con ventas.</p>
                        <p className="font-body text-xs mt-1">
                          Está presente en {deleteSalesCount} venta(s). No se borrará ninguna venta: conservarán nombre, cantidad y precio.
                        </p>
                      </div>
                    ) : (
                      <p className="font-body text-xs text-warm-gray mt-2">Este producto no tiene ventas registradas. Sus demás datos también quedarán guardados.</p>
                    )}
                  </div>

                  {deleteError && (
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 font-body text-sm text-red-700">
                      {deleteError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={closeDeleteDialog} disabled={deleting} className="flex-1 px-4 py-3 border border-border rounded-xl font-body text-sm font-semibold text-warm-gray hover:text-charcoal disabled:opacity-40">
                      Cancelar
                    </button>
                    <button onClick={handleDelete} disabled={deleting || Boolean(deleteError)} className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-body text-sm font-bold hover:bg-red-700 disabled:opacity-40">
                      {deleting ? 'Dando de baja...' : 'Confirmar baja'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {editingId !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="font-sans text-xl font-bold text-charcoal">
                {editingId === 'new' ? 'Nuevo Producto' : 'Editar Producto'}
              </h2>
              <button onClick={closeForm} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Nombre *</label>
                  <input name="name" value={form.name} onChange={handleChange} required
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                    placeholder="Ej: Pan Francés" />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Descripción</label>
                  <textarea name="description" value={form.description ?? ''} onChange={handleChange} rows={2}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy resize-none"
                    placeholder="Descripción corta del producto" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Precio</label>
                  <input name="price" type="number" value={form.price ?? ''} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                    placeholder="0.00" min="0" step="0.01" />
                  <span className="font-body text-[11px] text-warm-gray">Al guardar se redondea hacia arriba al próximo múltiplo de $100.</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Unidad</label>
                  <select name="unit" value={form.unit} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <label className="sm:col-span-2 flex items-start gap-2 cursor-pointer rounded-xl border border-border bg-cream/40 p-3">
                  <input type="checkbox" name="manual_price" checked={form.manual_price} onChange={handleChange}
                    className="w-4 h-4 mt-0.5 accent-burgundy" />
                  <span>
                    <span className="block font-body text-sm font-semibold text-charcoal">Precio manual</span>
                    <span className="block font-body text-xs text-warm-gray">La receta puede seguir calculando un sugerido, pero no reemplazará este precio.</span>
                  </span>
                </label>
                {form.unit !== 'kg' && (
                  <div className="sm:col-span-2 rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="font-body text-xs text-warm-gray uppercase tracking-wide">Presentaciones en mostrador</div>
                        <p className="font-body text-[11px] text-warm-gray mt-1">La cantidad indica cuánto stock base descuenta. El precio propio es opcional; vacío se calcula proporcionalmente.</p>
                      </div>
                      <button type="button" onClick={() => setForm((previous) => ({ ...previous, sale_options: [...previous.sale_options, { label: '', quantity: 1 }] }))}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-burgundy/10 text-burgundy font-body text-xs font-semibold">
                        <Plus size={13} /> Agregar
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {form.sale_options.map((option, index) => (
                        <div key={index} className="grid grid-cols-[1fr_80px] sm:grid-cols-[1fr_100px_110px_auto] gap-2 items-center">
                          <input value={option.label} onChange={(event) => setForm((previous) => ({ ...previous, sale_options: previous.sale_options.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item) }))}
                            placeholder="Ej.: Medio" className="px-3 py-2 border border-border rounded-lg font-body text-sm" />
                          <input type="number" min="0.001" step="any" value={option.quantity} onChange={(event) => setForm((previous) => ({ ...previous, sale_options: previous.sale_options.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item) }))}
                            aria-label="Cantidad de stock" title="Cantidad de stock" className="px-3 py-2 border border-border rounded-lg font-num text-sm" />
                          <input type="number" min="0" step="100" value={option.price ?? ''} onChange={(event) => setForm((previous) => ({ ...previous, sale_options: previous.sale_options.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value === '' ? null : Number(event.target.value) } : item) }))}
                            aria-label="Precio propio" placeholder="$ opcional" className="px-3 py-2 border border-border rounded-lg font-num text-sm" />
                          <button type="button" onClick={() => setForm((previous) => ({ ...previous, sale_options: previous.sale_options.filter((_, itemIndex) => itemIndex !== index) }))}
                            className="p-2 text-warm-gray hover:text-red-500"><Trash2 size={15} /></button>
                        </div>
                      ))}
                      {form.sale_options.length === 0 && <p className="font-body text-xs text-warm-gray">Sin opciones: al tocarlo se agregará una unidad directamente.</p>}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Categoría</label>
                  <select name="category" value={form.category ?? ''} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white">
                    <option value="">— Sin categoría —</option>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Orden</label>
                  <input name="sort_order" type="number" value={form.sort_order} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                    min="0" />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Imagen del producto</label>
                  <label className="cursor-pointer inline-block w-fit">
                    <span className="px-4 py-2 border border-border text-charcoal rounded-lg font-body text-sm bg-white hover:bg-cream transition-colors block">
                      {uploadingImage ? 'Subiendo...' : 'Seleccionar imagen...'}
                    </span>
                    <input type="file" accept="image/*" disabled={uploadingImage} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      handleImageUpload(file);
                    }} className="hidden" />
                  </label>
                  {imageError && <span className="font-body text-xs text-red-500 mt-1">{imageError}</span>}
                  {form.image_url && <img src={form.image_url} alt="Preview" className="h-16 w-16 object-cover rounded mt-2 shadow border border-border" />}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange}
                    className="w-4 h-4 accent-burgundy" />
                  <span className="font-body text-sm text-charcoal">Destacado</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving || uploadingImage}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark disabled:opacity-60 transition-colors">
                  {saving ? <span className="animate-spin border-2 border-cream/30 border-t-cream rounded-full w-4 h-4" /> : <Save size={16} />}
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={closeForm}
                  className="px-4 py-3 border border-border text-warm-gray rounded-xl font-body text-sm hover:text-charcoal transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto o categoría..."
          className="w-full pl-9 pr-3 py-2.5 border border-border rounded-xl font-body text-sm focus:outline-none focus:border-burgundy bg-white"
        />
      </div>

      {/* Products table */}
      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-cream-dark border-b border-border">
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Producto</th>
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Categoría</th>
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden md:table-cell">Precio</th>
                <th className="text-center px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Estado</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.featured && <Star size={14} className="text-gold fill-gold flex-shrink-0" />}
                      <span className="font-body text-sm font-semibold text-charcoal">{p.name}</span>
                    </div>
                    <span className="font-body text-xs text-warm-gray line-clamp-1">{p.description}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="px-2 py-0.5 bg-burgundy/10 text-burgundy rounded-full font-body text-xs">{p.category || 'Sin categoría'}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-num text-sm text-charcoal">
                      {p.price !== null ? `$${roundUpTo100(Number(p.price)).toLocaleString('es-AR', { maximumFractionDigits: 0 })} / ${p.unit}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {!p.active ? (
                      <span className="inline-flex px-2 py-1 rounded-full bg-red-50 text-red-700 font-body text-xs font-semibold">Baja</span>
                    ) : (
                      <span className="inline-flex px-2 py-1 rounded-full bg-green-50 text-green-700 font-body text-xs font-semibold">Vigente</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {!p.active ? (
                        <button onClick={() => restoreProduct(p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-green-700 bg-green-50 hover:bg-green-100 font-body text-xs font-semibold">
                          <RotateCcw size={14} /> Restaurar
                        </button>
                      ) : (
                        <>
                          <button onClick={() => toggleFeatured(p)}
                            className={`p-1.5 rounded-lg transition-colors ${p.featured ? 'text-gold bg-gold/10' : 'text-warm-gray hover:text-gold hover:bg-gold/10'}`}
                            title="Destacar">
                            <Star size={15} />
                          </button>
                          <button onClick={() => openEdit(p)}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-burgundy hover:bg-burgundy/10 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => openDeleteDialog(p)}
                            className="p-1.5 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-colors" title="Dar de baja">
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {displayedProducts.length === 0 && !search && (
            <div className="text-center py-12 text-warm-gray font-body text-sm">
              {showDeleted ? 'No hay productos dados de baja.' : 'No hay productos. Creá el primero.'}
            </div>
          )}
          {displayedProducts.length === 0 && Boolean(search) && (
            <div className="text-center py-12 text-warm-gray font-body text-sm">
              Sin resultados para “{search}”.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
