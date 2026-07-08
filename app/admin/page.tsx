import { createClient } from '@/lib/supabase/server'
import { Package, MessageSquare, ShoppingBag, Users, Receipt, ShoppingCart, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)

  const [productsRes, messagesRes, ordersRes, salesRes] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('read', false),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    supabase.from('sales').select('total').gte('sold_at', start.toISOString()).lt('sold_at', end.toISOString()),
  ])

  const todaySales = salesRes.data ?? []
  const todayTotal = todaySales.reduce((s, r) => s + Number(r.total), 0)
  const todayCount = todaySales.length
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const stats = [
    { label: 'Productos activos', value: productsRes.count ?? 0, icon: Package, href: '/admin/products', color: 'bg-burgundy' },
    { label: 'Mensajes sin leer', value: messagesRes.count ?? 0, icon: MessageSquare, href: '/admin/messages', color: 'bg-gold' },
    { label: 'Pedidos pendientes', value: ordersRes.count ?? 0, icon: ShoppingBag, href: '/admin/orders', color: 'bg-charcoal' },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Bienvenido al Panel</h1>
        <p className="font-body text-warm-gray mt-1">Gestioná el contenido y operaciones de Panadería Villa.</p>
      </div>

      {/* Ventas de hoy */}
      <Link href="/admin/ventas" className="group block mb-8 bg-burgundy text-cream rounded-2xl p-6 shadow-md hover:shadow-lg transition-all">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-sm text-cream/70 flex items-center gap-2"><Receipt size={15} /> Ventas de hoy</p>
            <p className="font-sans text-4xl font-bold mt-1">{fmt(todayTotal)}</p>
            <p className="font-body text-sm text-cream/80 mt-1 flex items-center gap-1.5"><ShoppingCart size={14} /> {todayCount} ticket(s)</p>
          </div>
          <span className="flex items-center gap-1 font-body text-sm font-semibold opacity-80 group-hover:opacity-100 transition-opacity">
            Ver detalle <ArrowRight size={16} />
          </span>
        </div>
      </Link>

      {/* Stats grid */}
      <div className="grid sm:grid-cols-3 gap-5 mb-10">
        {stats.map(({ label, value, icon: Icon, href, color }) => (
          <Link
            key={label}
            href={href}
            className="group bg-white rounded-2xl p-6 shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-sm text-warm-gray">{label}</p>
                <p className="font-sans text-4xl font-bold text-charcoal mt-1">{value}</p>
              </div>
              <div className={`${color} text-cream p-3 rounded-xl shadow-md`}>
                <Icon size={22} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick access */}
      <h2 className="font-sans text-xl font-bold text-charcoal mb-4">Acceso rápido</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { href: '/admin/products', label: 'Gestionar Productos', desc: 'Agregar, editar y ordenar productos', icon: Package },
          { href: '/admin/messages', label: 'Ver Mensajes', desc: 'Consultas y contactos recibidos', icon: MessageSquare },
          { href: '/admin/orders', label: 'Ver Pedidos', desc: 'Pedidos realizados desde el sitio', icon: ShoppingBag },
          { href: '/admin/content', label: 'Editar Contenido', desc: 'Textos, horarios y datos de contacto', icon: Users },
          { href: '/admin/costs', label: 'Calculadora de Costos', desc: 'Materias primas, recetas y precios', icon: Package },
        ].map(({ href, label, desc, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-start gap-4 p-5 bg-white rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-burgundy/30 hover:-translate-y-0.5 transition-all duration-200 group"
          >
            <div className="p-2.5 rounded-xl bg-burgundy/10 text-burgundy group-hover:bg-burgundy group-hover:text-cream transition-colors">
              <Icon size={20} />
            </div>
            <div>
              <div className="font-body font-semibold text-charcoal text-sm">{label}</div>
              <div className="font-body text-xs text-warm-gray mt-0.5">{desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
