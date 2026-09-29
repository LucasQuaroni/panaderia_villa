'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Banknote, Plus, Search, X } from 'lucide-react'

type Account = { id: string; name: string; phone: string; active: boolean; fiado_total: number; paid_total: number; balance: number }
type CashSession = { id: string }
const money = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value)
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR')

export default function FiadosPage() {
  const supabase = createClient()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [session, setSession] = useState<CashSession | null>(null)
  const [search, setSearch] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [paying, setPaying] = useState<Account | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'Efectivo' | 'Transferencia'>('Efectivo')
  const [busy, setBusy] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const [accountResult, sessionResult] = await Promise.all([
      supabase.from('retail_account_balances').select('id,name,phone,active,fiado_total,paid_total,balance').order('name'),
      supabase.from('cash_sessions').select('id').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (accountResult.error || sessionResult.error) {
      setError(accountResult.error?.message ?? sessionResult.error?.message ?? 'No se pudieron cargar los fiados.')
      return
    }
    setAccounts((accountResult.data ?? []) as Account[])
    setSession(sessionResult.data)
    setError('')
  }, [supabase])
  useEffect(() => {
    void load()
    const refresh = () => { void load() }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [load])

  const shown = useMemo(() => accounts
    .filter(account => normalize(`${account.name} ${account.phone}`).includes(normalize(search)))
    .sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || a.name.localeCompare(b.name, 'es-AR')), [accounts, search])
  const totalPending = accounts.reduce((sum, account) => sum + Number(account.balance), 0)

  const createCustomer = async () => {
    if (!name.trim() || savingRef.current) return
    savingRef.current = true; setBusy(true); setError(''); setMessage('')
    const { error: insertError } = await supabase.from('retail_customers').insert({ name: name.trim(), phone: phone.trim() })
    savingRef.current = false; setBusy(false)
    if (insertError) { setError(insertError.message); return }
    setName(''); setPhone(''); setNewOpen(false); setMessage('Cliente agregado. Ya podés elegirlo al registrar un fiado.')
    await load()
  }

  const registerPayment = async () => {
    if (!paying || savingRef.current) return
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0 || value > Number(paying.balance)) {
      setError('Ingresá un importe mayor que cero y que no supere el saldo pendiente.')
      return
    }
    if (!session) { setError('Abrí la caja antes de registrar el cobro.'); return }
    savingRef.current = true; setBusy(true); setError(''); setMessage('')
    const { error: paymentError } = await supabase.rpc('register_retail_payment', {
      p_customer_id: paying.id, p_cash_session_id: session.id, p_amount: value, p_payment_method: method,
    })
    if (paymentError) { savingRef.current = false; setBusy(false); setError(paymentError.message); return }
    setPaying(null); setAmount(''); setMessage(`Cobro de ${money(value)} registrado para ${paying.name}.`)
    await load()
    savingRef.current = false; setBusy(false)
  }

  return <div className="max-w-5xl mx-auto">
    <div className="flex flex-wrap justify-between gap-3 items-start mb-5">
      <div><h1 className="font-sans text-3xl font-bold text-charcoal">Fiados</h1><p className="font-body text-sm text-warm-gray mt-1">Las ventas quedan a nombre del cliente. Cuando paga, registrá el cobro para bajar su saldo.</p></div>
      <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-burgundy text-cream font-semibold"><Plus size={17}/> Nuevo cliente</button>
    </div>
    <div className="rounded-2xl border border-border bg-white p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><div className="text-xs text-warm-gray uppercase">Saldo pendiente total</div><div className="font-num text-2xl font-bold text-burgundy">{money(totalPending)}</div></div>
      <div className="relative w-full sm:w-72"><Search size={17} className="absolute top-3 left-3 text-warm-gray"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre o teléfono" className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg"/></div>
    </div>
    {message && <p className="mb-3 p-3 rounded-lg bg-green-50 text-green-800 text-sm">{message}</p>}
    {error && <p className="mb-3 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}
    <div className="bg-white rounded-2xl border border-border overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead><tr className="bg-cream-dark text-warm-gray text-left"><th className="p-3">Cliente</th><th className="p-3 text-right">Fiado</th><th className="p-3 text-right">Pagado</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Acción</th></tr></thead><tbody>
      {shown.map(account => <tr key={account.id} className="border-t border-border/60"><td className="p-3"><b>{account.name}</b><div className="text-xs text-warm-gray">{account.phone || 'Sin teléfono'}</div></td><td className="p-3 text-right font-num">{money(Number(account.fiado_total))}</td><td className="p-3 text-right font-num">{money(Number(account.paid_total))}</td><td className={`p-3 text-right font-num font-bold ${Number(account.balance) > 0 ? 'text-red-700' : 'text-green-700'}`}>{Number(account.balance) > 0 ? money(Number(account.balance)) : 'Saldado'}</td><td className="p-3 text-right"><button disabled={Number(account.balance) <= 0} onClick={() => { setPaying(account); setAmount(String(account.balance)); setError('') }} className="px-3 py-2 rounded-lg border border-burgundy text-burgundy font-semibold disabled:opacity-40">Registrar pago</button></td></tr>)}
      {shown.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-warm-gray">No hay clientes que coincidan.</td></tr>}
    </tbody></table></div></div>
    {newOpen && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setNewOpen(false)}><div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={event => event.stopPropagation()}><div className="flex justify-between mb-4"><h2 className="font-semibold text-lg">Nuevo cliente de fiado</h2><button onClick={() => setNewOpen(false)}><X size={18}/></button></div><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Nombre" className="w-full p-3 border rounded-lg mb-3"/><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="Teléfono (opcional)" className="w-full p-3 border rounded-lg mb-3"/>{error && <p className="text-red-700 text-sm mb-3">{error}</p>}<button disabled={busy || !name.trim()} onClick={() => void createCustomer()} className="w-full p-3 rounded-lg bg-burgundy text-cream font-semibold disabled:opacity-40">Guardar cliente</button></div></div>}
    {paying && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPaying(null)}><div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={event => event.stopPropagation()}><div className="flex justify-between mb-2"><h2 className="font-semibold text-lg">Cobro de {paying.name}</h2><button onClick={() => setPaying(null)}><X size={18}/></button></div><p className="text-sm text-warm-gray mb-4">Saldo pendiente: {money(Number(paying.balance))}</p><input autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Importe" className="w-full p-3 border rounded-lg mb-3"/><select value={method} onChange={event => setMethod(event.target.value as typeof method)} className="w-full p-3 border rounded-lg mb-3"><option>Efectivo</option><option>Transferencia</option></select>{error && <p className="text-red-700 text-sm mb-3">{error}</p>}{!session && <p className="text-red-700 text-sm mb-3">Abrí la caja para registrar el cobro.</p>}<button disabled={busy || !session} onClick={() => void registerPayment()} className="w-full p-3 rounded-lg bg-burgundy text-cream font-semibold disabled:opacity-40 flex items-center justify-center gap-2"><Banknote size={17}/> Registrar cobro</button></div></div>}
  </div>
}
