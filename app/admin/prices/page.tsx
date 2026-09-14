'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { roundUpTo100 } from '@/lib/money'
import { ClipboardList, Printer, Tags } from 'lucide-react'

interface Product {
  id: string
  name: string
  price: number | null
  unit: string
  category: string | null
}

type View = 'prices' | 'production'

export default function AdminPricesPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('prices')

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, price, unit, category')
        .eq('active', true)
        .order('name')
      setProducts(data ?? [])
      setLoading(false)
    })()
  }, [supabase])

  const fmtARS = (value: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value)
  const unitLabel = (unit: string) => unit === 'kg' ? '/ kg' : unit === 'unidad' ? 'c/u' : `/ ${unit}`
  const categories = useMemo(() => Array.from(products.reduce((map, product) => {
    const category = product.category || 'Otros'
    if (!map.has(category)) map.set(category, [])
    map.get(category)!.push(product)
    return map
  }, new Map<string, Product[]>())), [products])
  const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const title = view === 'prices' ? 'Lista de precios' : 'Planilla diaria de producción'

  return <div className="max-w-4xl mx-auto print-area">
    <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="font-sans text-3xl font-bold text-charcoal">{title}</h1>
        <p className="font-body text-warm-gray mt-1">{view === 'prices' ? 'Vista para imprimir y mostrar en el mostrador.' : 'Elegí qué productos incluir y completá a mano la producción del día.'}</p>
      </div>
      <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors shadow-md">
        <Printer size={16} /> Imprimir
      </button>
    </div>

    <div className="no-print flex gap-2 mb-5">
      <button onClick={() => setView('prices')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border ${view === 'prices' ? 'bg-charcoal text-cream border-charcoal' : 'bg-white border-border text-charcoal'}`}>
        <Tags size={15} /> Lista de precios
      </button>
      <button onClick={() => setView('production')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-body text-sm font-semibold border ${view === 'production' ? 'bg-charcoal text-cream border-charcoal' : 'bg-white border-border text-charcoal'}`}>
        <ClipboardList size={15} /> Hoja de producción
      </button>
    </div>

    {loading ? (
      <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
    ) : view === 'prices' ? (
      <div className="bg-white rounded-2xl border border-border shadow-sm print:shadow-none print:border-0 p-6 sm:p-8">
        <div className="text-center mb-6 pb-4 border-b-2 border-burgundy">
          <h2 className="font-sans text-3xl font-bold text-burgundy">Panadería Villa</h2>
          <p className="font-body text-sm text-warm-gray mt-1">Lista de precios · Actualizada al {today}</p>
        </div>
        {products.length === 0 ? (
          <p className="text-center py-12 text-warm-gray font-body text-sm">No hay productos activos para mostrar.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-6">
            {categories.map(([category, items]) => <div key={category} className="break-inside-avoid">
              <h3 className="font-sans text-lg font-bold text-charcoal border-b border-border pb-1 mb-2">{category}</h3>
              <table className="w-full"><tbody>{items.map(product => <tr key={product.id} className="border-b border-border/40">
                <td className="py-1.5 pr-2 font-body text-sm text-charcoal">{product.name}</td>
                <td className="py-1.5 text-right font-num text-sm font-bold text-burgundy whitespace-nowrap">{product.price !== null ? <>{fmtARS(roundUpTo100(Number(product.price)))} <span className="font-normal text-warm-gray text-xs">{unitLabel(product.unit)}</span></> : <span className="text-warm-gray">—</span>}</td>
              </tr>)}</tbody></table>
            </div>)}
          </div>
        )}
      </div>
    ) : <ProductionSheet products={products} />}
  </div>
}

function ProductionSheet({ products }: { products: Product[] }) {
  const [includedIds, setIncludedIds] = useState<Set<string>>(() => new Set(products.map(product => product.id)))
  const includedProducts = products.filter(product => includedIds.has(product.id))
  const midpoint = Math.ceil(includedProducts.length / 2)
  const columns = [includedProducts.slice(0, midpoint), includedProducts.slice(midpoint)]

  const toggleProduct = (productId: string) => {
    setIncludedIds(previous => {
      const next = new Set(previous)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  return <>
    <div className="no-print mb-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-body text-sm font-bold text-charcoal">Productos que saldrán impresos</h2>
          <p className="font-body text-xs text-warm-gray mt-0.5">{includedProducts.length} de {products.length} seleccionados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIncludedIds(new Set(products.map(product => product.id)))} className="px-3 py-1.5 rounded-lg border border-border font-body text-xs font-semibold text-charcoal hover:bg-cream">Incluir todos</button>
          <button onClick={() => setIncludedIds(new Set())} className="px-3 py-1.5 rounded-lg border border-border font-body text-xs font-semibold text-warm-gray hover:bg-cream">Quitar todos</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-2">
        {products.map(product => {
          const included = includedIds.has(product.id)
          return <button
            key={product.id}
            type="button"
            role="switch"
            aria-checked={included}
            onClick={() => toggleProduct(product.id)}
            className="flex items-center justify-between gap-3 py-1 text-left"
          >
            <span className={`font-body text-xs ${included ? 'font-semibold text-charcoal' : 'text-warm-gray'}`}>{product.name}</span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${included ? 'bg-burgundy' : 'bg-warm-gray-light'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${included ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </span>
          </button>
        })}
      </div>
    </div>

    <div className="production-sheet bg-white rounded-2xl border border-border shadow-sm print:shadow-none print:border-0 p-5 sm:p-6 print:p-0">
      <div className="text-center mb-3 pb-2 border-b-2 border-burgundy print:mb-2 print:pb-1">
        <h2 className="font-sans text-2xl print:text-xl font-bold text-burgundy">Panadería Villa</h2>
        <p className="font-body text-xs text-warm-gray">Planilla diaria de producción</p>
      </div>
      <div className="flex justify-between gap-6 mb-3 print:mb-2 font-body text-xs text-charcoal">
        <span>Fecha: <span className="inline-block min-w-40 border-b border-charcoal">&nbsp;</span></span>
        <span>Responsable: <span className="inline-block min-w-40 border-b border-charcoal">&nbsp;</span></span>
      </div>

      {includedProducts.length === 0 ? (
        <p className="py-12 text-center font-body text-sm text-warm-gray">Seleccioná al menos un producto para imprimir.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 print:gap-3">
          {columns.map((items, columnIndex) => <table key={columnIndex} className="w-full table-fixed">
            <thead><tr className="bg-cream-dark border-y border-border">
              <th className="w-[52%] text-left px-2 py-1.5 font-body text-[10px] text-warm-gray uppercase tracking-wide">Producto</th>
              <th className="w-[16%] text-left px-1 py-1.5 font-body text-[10px] text-warm-gray uppercase tracking-wide">Un.</th>
              <th className="w-[32%] text-left px-2 py-1.5 font-body text-[10px] text-warm-gray uppercase tracking-wide">Cantidad</th>
            </tr></thead>
            <tbody>{items.map(product => <tr key={product.id} className="border-b border-border">
              <td className="px-2 py-1 font-body text-[11px] leading-tight text-charcoal">{product.name}</td>
              <td className="px-1 py-1 font-body text-[10px] text-warm-gray">{product.unit}</td>
              <td className="px-2 py-1"><span className="block h-4 border-b border-charcoal/70" /></td>
            </tr>)}</tbody>
          </table>)}
        </div>
      )}
    </div>
  </>
}
