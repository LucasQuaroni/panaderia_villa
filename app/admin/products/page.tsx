'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, Star, Eye, EyeOff, Save, X } from 'lucide-react'

interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  unit: string
  category: string | null
  image_url: string | null
  featured: boolean
  active: boolean
  sort_order: number
}

const UNITS = ['unidad', 'kg', 'docena', 'porción', '1/2 kg', '100g']
const CATEGORIES = ['Panes', 'Facturas', 'Tortas', 'Especiales', 'Bebidas', 'Otros']

const emptyProduct: Omit<Product, 'id'> = {
  name: '',
  description: '',
  price: null,
  unit: 'unidad',
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
  const [form, setForm] = useState<Omit<Product, 'id'>>(emptyProduct)
  const [saving, setSaving] = useState(false)
  
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

  useEffect(() => { fetchProducts() }, [])

  const openNew = () => {
    setForm(emptyProduct)
    setEditingId('new')
  }

  const openEdit = (p: Product) => {
    const { id, ...rest } = p
    setForm(rest)
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
    if (editingId === 'new') {
      await supabase.from('products').insert(form)
    } else {
      await supabase.from('products').update(form).eq('id', editingId)
    }
    await fetchProducts()
    setSaving(false)
    closeForm()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este producto?')) return
    await supabase.from('products').delete().eq('id', id)
    await fetchProducts()
  }

  const toggleActive = async (p: Product) => {
    await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    await fetchProducts()
  }

  const toggleFeatured = async (p: Product) => {
    await supabase.from('products').update({ featured: !p.featured }).eq('id', p.id)
    await fetchProducts()
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Productos</h1>
          <p className="font-body text-warm-gray mt-1">Gestioná los productos del catálogo.</p>
        </div>
        <div className="flex items-center gap-2">
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
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Unidad</label>
                  <select name="unit" value={form.unit} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
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
                      Seleccionar imagen...
                    </span>
                    <input type="file" accept="image/*" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setForm(prev => ({ ...prev, image_url: reader.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }} className="hidden" />
                  </label>
                  {form.image_url && <img src={form.image_url} alt="Preview" className="h-16 w-16 object-cover rounded mt-2 shadow border border-border" />}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange}
                    className="w-4 h-4 accent-burgundy" />
                  <span className="font-body text-sm text-charcoal">Destacado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                  <div className="relative">
                    <input type="checkbox" name="active" checked={form.active} onChange={handleChange} className="sr-only" />
                    <div className={`block w-10 h-6 rounded-full transition-colors ${form.active ? 'bg-burgundy' : 'bg-warm-gray/30'}`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${form.active ? 'translate-x-4' : 'translate-x-0'}`}></div>
                  </div>
                  <span className="font-body text-sm text-charcoal">Mostrar al público</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} disabled={saving}
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
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-cream/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.featured && <Star size={14} className="text-gold fill-gold flex-shrink-0" />}
                      <span className="font-body text-sm font-semibold text-charcoal">{p.name}</span>
                    </div>
                    <span className="font-body text-xs text-warm-gray line-clamp-1">{p.description}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="px-2 py-0.5 bg-burgundy/10 text-burgundy rounded-full font-body text-xs">{p.category}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="font-body text-sm text-charcoal">
                      {p.price !== null ? `$${p.price.toLocaleString('es-AR')} / ${p.unit}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive(p)}
                      className={`relative w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ease-in-out mx-auto ${p.active ? 'bg-burgundy' : 'bg-warm-gray/30'}`}
                      title={p.active ? 'Visible' : 'Oculto'}>
                      <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ease-in-out ${p.active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => toggleFeatured(p)}
                        className={`p-1.5 rounded-lg transition-colors ${p.featured ? 'text-gold bg-gold/10' : 'text-warm-gray hover:text-gold hover:bg-gold/10'}`}
                        title="Destacar">
                        <Star size={15} />
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-warm-gray hover:text-burgundy hover:bg-burgundy/10 transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDelete(p.id)}
                        className="p-1.5 rounded-lg text-warm-gray hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="text-center py-12 text-warm-gray font-body text-sm">
              No hay productos. Creá el primero.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
