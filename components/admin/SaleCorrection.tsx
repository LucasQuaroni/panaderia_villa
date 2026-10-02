'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { roundUpTo100 } from '@/lib/money'
import { readJsonSetting } from '@/lib/json-settings'
import type { SalePaymentSummary } from '@/lib/pos/cash'
import { Plus, Trash2, X } from 'lucide-react'

interface Item { product_id: string | null; description: string; unit: string; quantity: number; stock_quantity: number; unit_price: number; subtotal: number; factor: number }
interface Sale { id: string; revision: number; payment_method: string; sale_channel: string; retail_customer_id: string | null; wholesale_customer_id: string | null; total: number; cash_session_id: string; cash_session: { status: string }; items: Omit<Item, 'factor'>[] }
interface Product { id: string; name: string; unit: string; price: number | null; active: boolean }
interface Snapshot { sale: { total: number; payment_method: string }; items: { description: string; quantity: number; stock_quantity: number; subtotal: number }[]; cash_paid: number; transfer_paid: number }
interface Correction { id: string; reason: string; corrected_at: string; before_data: Snapshot; after_data: Snapshot }
const money = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n)
const field = 'w-full px-3 py-2 border border-border rounded-lg bg-white text-sm'

export default function SaleCorrection({ saleId, onClose, onSaved }: { saleId: string; onClose: () => void; onSaved: () => void }) {
  const client = createClient()
  const [sale, setSale] = useState<Sale | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [wholesalePrices, setWholesalePrices] = useState<Record<string, { price: number }>>({})
  const [items, setItems] = useState<Item[]>([])
  const [method, setMethod] = useState('Efectivo')
  const [initial, setInitial] = useState('0')
  const [initialMethod, setInitialMethod] = useState('Efectivo')
  const [customer, setCustomer] = useState('')
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [summary, setSummary] = useState<SalePaymentSummary | null>(null)
  const [openSession, setOpenSession] = useState<string | null>(null)
  const [history, setHistory] = useState<Correction[]>([])
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const attempt = useRef<{ payload: string; id: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const [saleResult, productResult, summaryResult, sessionResult, historyResult, customersResult, prices] = await Promise.all([
        client.from('sales').select('id,revision,payment_method,sale_channel,retail_customer_id,wholesale_customer_id,total,cash_session_id,cash_session:cash_sessions(status),items:sale_items(product_id,description,unit,quantity,stock_quantity,unit_price,subtotal)').eq('id', saleId).single(),
        client.from('products').select('id,name,unit,price,active').order('name'),
        client.from('sale_payment_summary').select('*').eq('sale_id', saleId).single(),
        client.from('cash_sessions').select('id').eq('status', 'open').maybeSingle(),
        client.from('sale_corrections').select('id,reason,corrected_at,before_data,after_data').eq('sale_id', saleId).order('corrected_at', { ascending: false }),
        client.from('retail_customers').select('id,name').order('name'),
        readJsonSetting<Record<string, { price: number }>>(client, 'wholesale_prices_v1', {}),
      ])
      if (cancelled) return
      const failure = saleResult.error ?? productResult.error ?? summaryResult.error ?? sessionResult.error ?? historyResult.error ?? customersResult.error
      if (failure) { setError(failure.message); setLoading(false); return }
      const row = saleResult.data as unknown as Sale
      const paid = summaryResult.data as SalePaymentSummary
      setSale(row); setProducts((productResult.data ?? []) as Product[]); setWholesalePrices(prices)
      setItems(row.items.map(item => ({ ...item, quantity: Number(item.quantity), stock_quantity: Number(item.stock_quantity ?? item.quantity), unit_price: Number(item.unit_price), subtotal: Number(item.subtotal), factor: Number(item.stock_quantity ?? item.quantity) / Number(item.quantity) })))
      setMethod(row.payment_method); setCustomer(row.retail_customer_id ?? '')
      setInitial(row.payment_method === 'Fiado' || row.payment_method === 'Cuenta corriente' ? String(Number(paid.cash_paid) + Number(paid.transfer_paid)) : '0')
      setInitialMethod(Number(paid.transfer_paid) > 0 ? 'Transferencia' : 'Efectivo')
      setSummary(paid); setOpenSession(sessionResult.data?.id ?? null)
      setHistory((historyResult.data ?? []) as Correction[]); setCustomers(customersResult.data ?? [])
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [client, saleId])

  const account = method === 'Fiado' || method === 'Cuenta corriente'
  const gross = items.reduce((sum, item) => sum + item.subtotal, 0)
  const total = method === 'Consumo interno' ? 0 : gross
  const paid = account ? Number(initial.replace(',', '.')) : 0
  const cashAfter = method === 'Efectivo' ? total : account && initialMethod === 'Efectivo' ? paid : 0
  const transferAfter = method === 'Transferencia' ? total : account && initialMethod === 'Transferencia' ? paid : 0
  const cashDelta = cashAfter - Number(summary?.cash_paid ?? 0), transferDelta = transferAfter - Number(summary?.transfer_paid ?? 0)
  const closed = sale?.cash_session.status === 'closed'
  const valid = items.length > 0 && items.every(item => item.description.trim() && item.quantity > 0 && Number.isFinite(item.quantity) && item.stock_quantity > 0 && Number.isFinite(item.stock_quantity) && Number.isFinite(item.unit_price) && item.unit_price >= 0)
    && reason.trim().length >= 5 && (!account || (Number.isFinite(paid) && paid >= 0 && paid < total && (method !== 'Fiado' || customer)))
    && (!closed || Boolean(openSession))

  const editItem = (index: number, patch: Partial<Item>, recalculate = false) => setItems(previous => previous.map((item, i) => {
    if (i !== index) return item
    const next = { ...item, ...patch }
    if (recalculate) { next.stock_quantity = Math.round(next.quantity * next.factor * 1000) / 1000; next.subtotal = roundUpTo100(next.quantity * next.unit_price) }
    return next
  }))
  const chooseProduct = (index: number, id: string) => {
    const product = products.find(row => row.id === id)
    const price = product ? roundUpTo100(Number((sale?.sale_channel === 'mayorista' ? wholesalePrices[product.id]?.price : undefined) ?? product.price ?? 0)) : 0
    editItem(index, product ? { product_id: product.id, description: product.name, unit: product.unit, unit_price: price, factor: 1 } : { product_id: null, description: 'Varios', unit: 'unidad', factor: 1 }, true)
  }
  const save = async () => {
    if (!sale || !valid || saveLock.current) return
    const payload = { p_sale_id: sale.id, p_expected_revision: sale.revision, p_items: items.map(({ factor, ...item }) => item), p_payment_method: method, p_initial_paid: paid, p_initial_method: initialMethod, p_reason: reason.trim(), p_adjustment_session_id: openSession, p_retail_customer_id: customer || null }
    const signature = JSON.stringify(payload)
    if (attempt.current?.payload !== signature) attempt.current = { payload: signature, id: crypto.randomUUID() }
    saveLock.current = true; setSaving(true); setError('')
    const { error: saveError } = await client.rpc('correct_sale', { ...payload, p_request_id: attempt.current.id })
    if (saveError) { setError(saveError.message); setSaving(false); saveLock.current = false; return }
    onSaved()
  }

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { if (!saving) onClose() }}>
    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 z-10 bg-white border-b p-5 flex items-center justify-between"><div><h2 className="text-xl font-bold">Edición extraordinaria</h2><p className="text-xs text-warm-gray">Solo administrador · conserva el historial de la venta</p></div><button disabled={saving} onClick={onClose}><X size={20}/></button></div>
      {loading ? <p className="p-8 text-center text-warm-gray">Cargando venta...</p> : <div className="p-5 space-y-4">
        {error && <p className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
        {sale && <>
          <div className="space-y-3">{items.map((item, index) => <div key={index} className="border rounded-xl p-3 space-y-2"><div className="flex gap-2"><select aria-label={`Producto ${index + 1}`} value={item.product_id ?? ''} onChange={e => chooseProduct(index, e.target.value)} className={field}><option value="">Monto libre</option>{products.filter(product => product.active || product.id === item.product_id).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button aria-label={`Quitar producto ${index + 1}`} onClick={() => setItems(rows => rows.filter((_, i) => i !== index))} className="p-2 text-red-600"><Trash2 size={17}/></button></div>
            <input aria-label={`Descripción ${index + 1}`} className={field} value={item.description} onChange={e => editItem(index, { description: e.target.value })}/>
            <div className="grid grid-cols-3 gap-2"><label className="text-xs text-warm-gray">Cantidad ({item.unit})<input aria-label={`Cantidad ${index + 1}`} type="number" step="0.001" min="0.001" className={field} value={item.quantity} onChange={e => editItem(index, { quantity: Number(e.target.value) }, true)}/></label><label className="text-xs text-warm-gray">Precio por {item.unit}<input aria-label={`Precio ${index + 1}`} type="number" step="0.01" min="0" className={field} value={item.unit_price} onChange={e => editItem(index, { unit_price: Number(e.target.value) }, true)}/></label><div className="text-xs text-warm-gray">Subtotal<div className="p-2 font-num font-bold text-charcoal">{money(item.subtotal)}</div></div></div>
            <p className="text-xs text-warm-gray">{item.product_id ? `Stock que corresponde a este renglón: ${item.stock_quantity.toLocaleString('es-AR', { maximumFractionDigits: 3 })}` : 'Monto libre: sin movimiento de stock'}</p>
          </div>)}</div>
          <button onClick={() => setItems(rows => [...rows, { product_id: null, description: 'Varios', unit: 'unidad', quantity: 1, stock_quantity: 1, factor: 1, unit_price: 0, subtotal: 0 }])} className="flex gap-2 items-center border rounded-lg px-3 py-2 text-sm text-burgundy"><Plus size={16}/>Agregar renglón</button>
          <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Medio de pago<select className={`${field} mt-1`} value={method} onChange={e => { setMethod(e.target.value); if (!account) setInitial('0') }}><option>Efectivo</option><option>Transferencia</option><option>{sale.sale_channel === 'mayorista' ? 'Cuenta corriente' : 'Fiado'}</option><option>Consumo interno</option></select></label><div className="p-3 rounded-lg bg-cream-dark">Total corregido <b className="font-num">{money(total)}</b></div></div>
          {account && <div className="grid sm:grid-cols-2 gap-3">{method === 'Fiado' && <label className="sm:col-span-2 text-sm">Cliente de fiado<select value={customer} disabled={Boolean(sale.retail_customer_id)} onChange={e => setCustomer(e.target.value)} className={`${field} mt-1`}><option value="">Elegir cliente</option>{customers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}<label className="text-sm">Abono inicial (0 si no hubo)<input value={initial} onChange={e => setInitial(e.target.value)} inputMode="decimal" className={`${field} mt-1`}/></label><label className="text-sm">Medio del abono<select className={`${field} mt-1`} value={initialMethod} onChange={e => setInitialMethod(e.target.value)}><option>Efectivo</option><option>Transferencia</option></select></label><p className="text-sm sm:col-span-2">Deuda de esta venta: {money(Number.isFinite(paid) ? total - paid : total)}</p></div>}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"><p>{closed ? 'La caja original ya cerró. El ajuste se registra en la caja actual y conserva el cierre anterior.' : 'Se recalculan los importes de la caja de esta venta.'}</p><p className="mt-1">Diferencia en efectivo: <b>{money(Number.isFinite(cashDelta) ? cashDelta : 0)}</b> · Transferencia: <b>{money(Number.isFinite(transferDelta) ? transferDelta : 0)}</b></p>{closed && !openSession && <p className="text-red-700 mt-1">Abrí una caja antes de guardar esta corrección.</p>}</div>
          <label className="block text-sm font-semibold">Motivo de la corrección<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Qué se cargó mal y qué estás corrigiendo" className={`${field} mt-1`} rows={2}/></label>
          <button disabled={!valid || saving} onClick={() => void save()} className="bg-burgundy text-cream rounded-xl px-5 py-3 font-semibold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar corrección y ajustar stock/caja'}</button>
        </>}
        {history.length > 0 && <div className="border-t pt-4"><h3 className="font-bold mb-3">Correcciones anteriores</h3>{history.map(row => <details key={row.id} className="border rounded-lg p-3 mb-2 text-sm"><summary className="cursor-pointer"><b>{new Date(row.corrected_at).toLocaleString('es-AR')}</b> · {row.reason}</summary><div className="grid sm:grid-cols-2 gap-3 mt-3">{([['Antes', row.before_data], ['Después', row.after_data]] as const).map(([label, snapshot]) => <div key={label}><b>{label}: {money(Number(snapshot.sale.total))} · {snapshot.sale.payment_method}</b><p className="text-xs text-warm-gray">Efectivo {money(Number(snapshot.cash_paid))} · Transferencia {money(Number(snapshot.transfer_paid))}</p><ul className="mt-2 text-xs">{snapshot.items.map((item, i) => <li key={i}>{item.quantity} × {item.description} · {money(Number(item.subtotal))}</li>)}</ul></div>)}</div></details>)}</div>}
      </div>}
    </div>
  </div>
}
