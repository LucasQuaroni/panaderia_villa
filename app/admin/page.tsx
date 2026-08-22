import { createClient } from '@/lib/supabase/server'
import { Package, MessageSquare, ShoppingBag, Receipt, ShoppingCart } from 'lucide-react'
import { getUserRole } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'

export default async function AdminDashboard() {
  if ((await getUserRole()) !== 'admin') redirect('/admin/pos')
  const supabase = await createClient()

  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)

  const [productsRes, messagesRes, ordersRes, salesRes] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('read', false),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pendiente'),
    supabase.from('sales').select('total').gte('sold_at', start.toISOString()).lt('sold_at', end.toISOString()),
  ])

  const todaySales = salesRes.data ?? []
  const todayTotal = todaySales.reduce((s, r) => s + Number(r.total), 0)
  const todayCount = todaySales.length
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const stats = [
    { label: 'Productos activos', value: productsRes.count ?? 0, icon: Package, color: 'bg-burgundy' },
    { label: 'Mensajes sin leer', value: messagesRes.count ?? 0, icon: MessageSquare, color: 'bg-gold' },
    { label: 'Pedidos pendientes', value: ordersRes.count ?? 0, icon: ShoppingBag, color: 'bg-charcoal' },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Bienvenido al Panel</h1>
        <p className="font-body text-warm-gray mt-1">Gestioná el contenido y operaciones de Panadería Villa.</p>
      </div>

      {/* Ventas de hoy */}
      <div className="mb-8 bg-burgundy text-cream rounded-2xl p-6 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body text-sm text-cream/70 flex items-center gap-2"><Receipt size={15} /> Ventas de hoy</p>
            <p className="font-num text-4xl font-bold mt-1">{fmt(todayTotal)}</p>
            <p className="font-body text-sm text-cream/80 mt-1 flex items-center gap-1.5"><ShoppingCart size={14} /> {todayCount} ticket(s)</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid sm:grid-cols-3 gap-5 mb-10">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-white rounded-2xl p-6 shadow-sm border border-border"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-body text-sm text-warm-gray">{label}</p>
                <p className="font-num text-4xl font-bold text-charcoal mt-1">{value}</p>
              </div>
              <div className={`${color} text-cream p-3 rounded-xl shadow-md`}>
                <Icon size={22} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
