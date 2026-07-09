'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer } from 'lucide-react'

interface Product {
  id: string
  name: string
  price: number | null
  unit: string
  category: string | null
  active: boolean
  sort_order: number
}

export default function AdminPricesPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchProducts = async () => {
      const { data } = await supabase
        .from('products')
        // Incluye también los "no públicos" (se venden en el mostrador aunque no estén en la web).
        .select('id, name, price, unit, category, active, sort_order')
        .order('sort_order')
      setProducts(data ?? [])
      setLoading(false)
    }
    fetchProducts()
  }, [supabase])

  const fmtARS = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const unitLabel = (u: string) => (u === 'kg' ? '/ kg' : u === 'unidad' ? 'c/u' : `/ ${u}`)

  // Agrupar por categoría, respetando el orden.
  const categories = Array.from(
    products.reduce((map, p) => {
      const cat = p.category || 'Otros'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(p)
      return map
    }, new Map<string, Product[]>())
  )

  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-4xl mx-auto print-area">
      {/* Encabezado en pantalla */}
      <div className="no-print flex items-center justify-between mb-6">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Lista de Precios</h1>
          <p className="font-body text-warm-gray mt-1">
            Vista para imprimir y mostrar en el mostrador. Incluye los productos no públicos.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md"
        >
          <Printer size={16} /> Imprimir
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-sm print:shadow-none print:border-0 p-6 sm:p-8">
          {/* Título de la hoja (visible también al imprimir) */}
          <div className="text-center mb-6 pb-4 border-b-2 border-burgundy">
            <h2 className="font-sans text-3xl font-bold text-burgundy">Panadería Villa</h2>
            <p className="font-body text-sm text-warm-gray mt-1">Lista de precios · Actualizada al {today}</p>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12 text-warm-gray font-body text-sm">
              No hay productos activos para mostrar.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
              {categories.map(([cat, items]) => (
                <div key={cat} className="break-inside-avoid">
                  <h3 className="font-sans text-lg font-bold text-charcoal border-b border-border pb-1 mb-2">
                    {cat}
                  </h3>
                  <table className="w-full">
                    <tbody>
                      {items.map((p) => (
                        <tr key={p.id} className="border-b border-border/40">
                          <td className="py-1.5 pr-2 font-body text-sm text-charcoal">
                            {p.name}
                            {p.active === false && <span className="text-warm-gray text-xs font-normal"> (no público)</span>}
                          </td>
                          <td className="py-1.5 text-right font-body text-sm font-bold text-burgundy whitespace-nowrap">
                            {p.price !== null ? (
                              <>
                                {fmtARS(p.price)}{' '}
                                <span className="font-normal text-warm-gray text-xs">{unitLabel(p.unit)}</span>
                              </>
                            ) : (
                              <span className="text-warm-gray">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
