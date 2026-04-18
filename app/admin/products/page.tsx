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

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('sort_order')
    setProducts(data ?? [])
    setLoading(false)
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
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md"
        >
          <Plus size={16} /> Nuevo producto
        </button>
      </div>

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
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Orden</label>
                  <input name="sort_order" type="number" value={form.sort_order} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                    min="0" />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="font-body text-xs text-warm-gray uppercase tracking-wide">URL de imagen</label>
                  <input name="image_url" value={form.image_url ?? ''} onChange={handleChange}
                    className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy"
                    placeholder="https://..." />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="featured" checked={form.featured} onChange={handleChange}
                    className="w-4 h-4 accent-burgundy" />
                  <span className="font-body text-sm text-charcoal">Destacado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" name="active" checked={form.active} onChange={handleChange}
                    className="w-4 h-4 accent-burgundy" />
                  <span className="font-body text-sm text-charcoal">Activo</span>
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
                      className={`p-1.5 rounded-lg transition-colors ${p.active ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-warm-gray bg-cream-dark hover:bg-border'}`}
                      title={p.active ? 'Activo' : 'Inactivo'}>
                      {p.active ? <Eye size={15} /> : <EyeOff size={15} />}
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
