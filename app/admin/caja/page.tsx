'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSetting, writeJsonSetting } from '@/lib/json-settings'
import { loadCashMovements, summarizeCash, type CashMovement } from '@/lib/pos/cash'
import CashMovements from '@/components/admin/CashMovements'
import { Calendar, Save, Settings2 } from 'lucide-react'

interface Session {
  id: string; opened_at: string; closed_at: string | null; opening_float: number
  counted_cash: number | null; status: string; notes: string | null
}
const CASH_SETTINGS_KEY = 'cash_settings_v1'
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function CajaHistoryPage() {
  const supabase = createClient()
  const settingsLoaded = useRef(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [debts, setDebts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openingFloat, setOpeningFloat] = useState('3000')
  const [closingReserve, setClosingReserve] = useState('3000')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const [result, settings] = await Promise.all([
        supabase.from('cash_sessions').select('id,opened_at,closed_at,opening_float,counted_cash,status,notes').order('opened_at', { ascending: false }).limit(60),
        readJsonSetting(supabase, CASH_SETTINGS_KEY, { cash_opening_float: 3000, cash_closing_reserve: 3000 }),
      ])
      if (result.error) throw new Error(result.error.message)
      const list = (result.data ?? []) as Session[]
      const ids = list.map(row => row.id)
      const rows = await loadCashMovements(supabase, ids)
      const debtBySession: Record<string, number> = {}
      if (ids.length) {
        for (let offset = 0; ; offset += 500) {
          const { data, error: queryError } = await supabase.from('sale_payment_summary').select('cash_session_id,debt_amount').in('cash_session_id', ids).order('sale_id').range(offset, offset + 499)
          if (queryError) throw new Error(queryError.message)
          for (const row of data ?? []) if (row.cash_session_id) debtBySession[row.cash_session_id] = (debtBySession[row.cash_session_id] ?? 0) + Number(row.debt_amount)
          if ((data ?? []).length < 500) break
        }
      }
      setSessions(list); setMovements(rows); setDebts(debtBySession); setError('')
      if (settings && !settingsLoaded.current) { settingsLoaded.current = true; setOpeningFloat(String(settings.cash_opening_float)); setClosingReserve(String(settings.cash_closing_reserve)) }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cargar la caja.') }
    setLoading(false)
  }, [supabase])
  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load])

  const saveSettings = async () => {
    const opening = Number(openingFloat.replace(',', '.')), reserve = Number(closingReserve.replace(',', '.'))
    if (!Number.isFinite(opening) || !Number.isFinite(reserve) || opening < 0 || reserve < 0) return
    setSavingSettings(true); setSettingsSaved(false)
    const saveError = await writeJsonSetting(supabase, CASH_SETTINGS_KEY, { cash_opening_float: opening, cash_closing_reserve: reserve })
    setSavingSettings(false); setSettingsSaved(!saveError)
    if (saveError) setError(saveError)
  }

  return <div className="max-w-5xl mx-auto">
    <div className="mb-6"><h1 className="font-sans text-3xl font-bold text-charcoal">Caja y movimientos</h1><p className="font-body text-warm-gray mt-1">Ventas cobradas, pagos de cuentas y ajustes de cada turno.</p></div>
    <div className="mb-6 bg-white rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4"><Settings2 size={18} className="text-burgundy"/><div><h2 className="font-sans font-bold">Montos fijos de caja</h2><p className="text-xs text-warm-gray">Se aplican a las próximas aperturas y cierres.</p></div></div>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <label className="text-xs text-warm-gray">Fondo al abrir<input type="number" min="0" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} className="block w-full border rounded-lg p-3 mt-1 font-num"/></label>
        <label className="text-xs text-warm-gray">Dejar en cada cierre<input type="number" min="0" value={closingReserve} onChange={e => setClosingReserve(e.target.value)} className="block w-full border rounded-lg p-3 mt-1 font-num"/></label>
        <button onClick={() => void saveSettings()} disabled={savingSettings} className="flex gap-2 items-center justify-center bg-burgundy text-cream rounded-lg px-4 py-3 disabled:opacity-40"><Save size={15}/>{savingSettings ? 'Guardando...' : 'Guardar'}</button>
      </div>{settingsSaved && <p className="text-xs text-green-700 mt-2">Configuración guardada.</p>}
    </div>
    {error && <p className="p-3 mb-4 bg-red-50 text-red-700 rounded-lg">{error}</p>}
    {loading ? <p className="text-center p-12 text-warm-gray">Cargando caja...</p> : sessions.length === 0 ? <p className="p-8 border rounded-xl bg-white text-warm-gray">Todavía no hay turnos de caja.</p> : <div className="space-y-4">{sessions.map(session => {
      const rows = movements.filter(row => row.cash_session_id === session.id), totals = summarizeCash(rows)
      const expected = Math.round((Number(session.opening_float) + totals.cash) * 100) / 100
      const diff = session.counted_cash == null ? null : Number(session.counted_cash) - expected
      let close: { closing_shift?: string; cash_withdrawn?: number } = {}
      try { close = JSON.parse(session.notes ?? '{}') } catch {}
      return <details key={session.id} open={session.status === 'open'} className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
        <summary className="p-4 cursor-pointer"><div className="inline-flex flex-wrap w-full items-center justify-between gap-3"><div><div className="flex gap-2 items-center font-semibold"><Calendar size={15}/>{session.status === 'open' ? 'Caja abierta' : `Cierre ${fmtDate(session.closed_at)}`}</div><p className="text-xs text-warm-gray mt-1">Abrió {fmtDate(session.opened_at)}{close.closing_shift ? ` · ${close.closing_shift === 'mediodia' ? 'Mediodía' : 'Noche'}` : ''}</p></div><div className="text-right"><div className="text-xs text-warm-gray">Ingresos netos</div><b className="font-num text-burgundy">{fmt(totals.total)}</b>{session.status === 'closed' && diff !== null && <p className={`text-xs ${diff === 0 ? 'text-green-700' : 'text-red-700'}`}>{diff === 0 ? 'Caja exacta' : `Diferencia ${fmt(diff)}`}</p>}</div></div></summary>
        <div className="border-t p-4 space-y-3"><div className="flex flex-wrap justify-between gap-2 text-sm text-warm-gray"><span>Efectivo esperado: {fmt(expected)} (incluye fondo)</span><span>Transferencias: {fmt(totals.transfer)}</span>{session.counted_cash != null && <span>Efectivo contado: {fmt(Number(session.counted_cash))}</span>}{close.cash_withdrawn != null && <span>Retirado: {fmt(close.cash_withdrawn)}</span>}</div><CashMovements rows={rows}/>{(debts[session.id] ?? 0) > 0 && <p className="text-xs text-warm-gray">Saldo vendido a cuenta en este turno: {fmt(debts[session.id])}. No suma dinero al cierre.</p>}</div>
      </details>
    })}</div>}
  </div>
}
