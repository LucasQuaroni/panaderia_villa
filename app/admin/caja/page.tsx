'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DoorClosed, Calendar } from 'lucide-react'

interface Session {
  id: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  counted_cash: number | null
  status: string
}

interface Row extends Session {
  totalSales: number
  cashSales: number
  ticketCount: number
}

export default function CajaHistoryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: sessions } = await supabase
        .from('cash_sessions')
        .select('id, opened_at, closed_at, opening_float, counted_cash, status')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(60)

      const list = (sessions ?? []) as Session[]
      const ids = list.map(s => s.id)

      const salesBySession: Record<string, { total: number; cash: number; count: number }> = {}
      if (ids.length > 0) {
        const { data: sales } = await supabase
          .from('sales')
          .select('cash_session_id, total, payment_method')
          .in('cash_session_id', ids)
        for (const s of sales ?? []) {
          const key = s.cash_session_id as string
          if (!salesBySession[key]) salesBySession[key] = { total: 0, cash: 0, count: 0 }
          salesBySession[key].total += Number(s.total)
          salesBySession[key].count += 1
          if (s.payment_method === 'Efectivo') salesBySession[key].cash += Number(s.total)
        }
      }

      setRows(list.map(s => ({
        ...s,
        totalSales: salesBySession[s.id]?.total ?? 0,
        cashSales: salesBySession[s.id]?.cash ?? 0,
        ticketCount: salesBySession[s.id]?.count ?? 0,
      })))
      setLoading(false)
    }
    load()
  }, [supabase])

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const fmtDate = (s: string | null) =>
    s ? new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Historial de Caja</h1>
        <p className="font-body text-warm-gray mt-1">Cierres anteriores, con sus totales y diferencias.</p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-border font-body text-warm-gray text-sm">
          Todavía no hay cierres de caja.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-cream-dark border-b border-border">
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Cierre</th>
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Tickets</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Vendido</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden md:table-cell">Efectivo esperado</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const expectedCash = r.opening_float + r.cashSales
                const diff = r.counted_cash !== null ? r.counted_cash - expectedCash : null
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-cream/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-body text-sm font-semibold text-charcoal">
                        <Calendar size={14} className="text-warm-gray" /> {fmtDate(r.closed_at)}
                      </div>
                      <div className="font-body text-xs text-warm-gray">Abrió {fmtDate(r.opened_at)}</div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-body text-sm text-warm-gray">{r.ticketCount}</td>
                    <td className="px-4 py-3 text-right font-body text-sm font-bold text-burgundy">{fmt(r.totalSales)}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-body text-sm text-warm-gray">{fmt(expectedCash)}</td>
                    <td className="px-4 py-3 text-right font-body text-sm font-semibold">
                      {diff === null ? (
                        <span className="text-warm-gray">—</span>
                      ) : diff === 0 ? (
                        <span className="text-green-700">Exacto</span>
                      ) : diff > 0 ? (
                        <span className="text-blue-700">+{fmt(diff)}</span>
                      ) : (
                        <span className="text-red-600">{fmt(diff)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
