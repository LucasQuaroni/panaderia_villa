'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSetting, writeJsonSetting } from '@/lib/json-settings'
import { Calendar, Save, Settings2 } from 'lucide-react'

interface Session {
  id: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  counted_cash: number | null
  status: string
  closing_shift: 'mediodia' | 'noche' | null
  cash_left: number | null
  cash_withdrawn: number | null
  notes?: string | null
}

const CASH_SETTINGS_KEY = 'cash_settings_v1'

interface Row extends Session {
  totalSales: number
  cashSales: number
  ticketCount: number
}

export default function CajaHistoryPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [openingFloat, setOpeningFloat] = useState('3000')
  const [closingReserve, setClosingReserve] = useState('3000')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [{ data: sessions }, settings] = await Promise.all([
        supabase
          .from('cash_sessions')
          .select('id, opened_at, closed_at, opening_float, counted_cash, status, notes')
          .eq('status', 'closed')
          .order('closed_at', { ascending: false })
          .limit(60),
        readJsonSetting(supabase, CASH_SETTINGS_KEY, { cash_opening_float: 3000, cash_closing_reserve: 3000 }),
      ])

      if (settings) {
        setOpeningFloat(String(settings.cash_opening_float))
        setClosingReserve(String(settings.cash_closing_reserve))
      }

      const list = (sessions ?? []).map((session) => {
        let closeData: { closing_shift?: 'mediodia' | 'noche'; cash_left?: number; cash_withdrawn?: number } = {}
        try { closeData = JSON.parse(session.notes ?? '{}') } catch {}
        return {
          ...session,
          closing_shift: closeData.closing_shift ?? null,
          cash_left: closeData.cash_left ?? null,
          cash_withdrawn: closeData.cash_withdrawn ?? null,
        } as Session
      })
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

  const saveSettings = async () => {
    const opening = Number(openingFloat.replace(',', '.'))
    const reserve = Number(closingReserve.replace(',', '.'))
    if (!Number.isFinite(opening) || !Number.isFinite(reserve) || opening < 0 || reserve < 0) return
    setSavingSettings(true)
    setSettingsSaved(false)
    const error = await writeJsonSetting(supabase, CASH_SETTINGS_KEY, {
      cash_opening_float: opening,
      cash_closing_reserve: reserve,
    })
    setSavingSettings(false)
    setSettingsSaved(!error)
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Historial de Caja</h1>
        <p className="font-body text-warm-gray mt-1">Cierres anteriores, con sus totales y diferencias.</p>
      </div>

      <div className="mb-6 bg-white rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={18} className="text-burgundy" />
          <div>
            <h2 className="font-sans font-bold text-charcoal">Montos fijos de caja</h2>
            <p className="font-body text-xs text-warm-gray">Se aplican a las próximas aperturas y cierres.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Fondo al abrir</label>
            <input type="number" min="0" step="any" value={openingFloat} onChange={(event) => setOpeningFloat(event.target.value)} className="px-3 py-2.5 border border-border rounded-lg font-num text-sm focus:outline-none focus:border-burgundy" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Dejar en cada cierre</label>
            <input type="number" min="0" step="any" value={closingReserve} onChange={(event) => setClosingReserve(event.target.value)} className="px-3 py-2.5 border border-border rounded-lg font-num text-sm focus:outline-none focus:border-burgundy" />
          </div>
          <button onClick={saveSettings} disabled={savingSettings} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-lg font-body text-sm font-semibold hover:bg-burgundy-dark disabled:opacity-50">
            <Save size={15} /> {savingSettings ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        {settingsSaved && <p className="mt-2 font-body text-xs text-green-700">Configuración guardada.</p>}
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
                <th className="text-left px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden sm:table-cell">Turno / Tickets</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide">Vendido</th>
                <th className="text-right px-4 py-3 font-body text-xs text-warm-gray uppercase tracking-wide hidden md:table-cell">Retirado</th>
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
                    <td className="px-4 py-3 hidden sm:table-cell font-body text-sm text-warm-gray">
                      <div className="capitalize">{r.closing_shift === 'mediodia' ? 'Mediodía' : r.closing_shift ?? '—'}</div>
                      <div className="text-xs">{r.ticketCount} ticket(s)</div>
                    </td>
                    <td className="px-4 py-3 text-right font-num text-sm font-bold text-burgundy">{fmt(r.totalSales)}</td>
                    <td className="px-4 py-3 text-right hidden md:table-cell font-num text-sm text-warm-gray">{r.cash_withdrawn !== null ? fmt(r.cash_withdrawn) : '—'}</td>
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
