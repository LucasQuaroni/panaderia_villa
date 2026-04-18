'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ShoppingBag } from 'lucide-react'

interface Order {
  id: string
  name: string
  email: string
  phone: string | null
  items: unknown[]
  notes: string | null
  status: string
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  confirmado: 'bg-blue-100 text-blue-700',
  listo: 'bg-green-100 text-green-700',
  entregado: 'bg-gray-100 text-gray-600',
  cancelado: 'bg-red-100 text-red-600',
}

const ALL_STATUSES = ['pendiente', 'confirmado', 'listo', 'entregado', 'cancelado']

export default function AdminOrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    setOrders(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchOrders() }, [])

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('orders').update({ status }).eq('id', id)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Pedidos</h1>
        <p className="font-body text-warm-gray mt-1">Pedidos recibidos desde el formulario del sitio.</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border">
          <ShoppingBag size={40} className="text-warm-gray-light mb-3" />
          <p className="font-body text-warm-gray text-sm">No hay pedidos todavía.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white rounded-2xl border border-border shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-body font-semibold text-charcoal">{order.name}</h3>
                  <div className="font-body text-xs text-warm-gray mt-0.5">
                    {order.email} {order.phone && `• ${order.phone}`}
                  </div>
                  <div className="font-body text-xs text-warm-gray/60 mt-1">
                    {format(new Date(order.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                  </div>
                </div>
                <select
                  value={order.status}
                  onChange={(e) => updateStatus(order.id, e.target.value)}
                  className={`px-3 py-1.5 rounded-full font-body text-xs font-semibold border-0 cursor-pointer ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {ALL_STATUSES.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              {order.notes && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="font-body text-sm text-warm-gray italic">"{order.notes}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
