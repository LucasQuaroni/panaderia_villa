'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSetting, writeJsonSetting } from '@/lib/json-settings'
import { roundUpTo100 } from '@/lib/money'
import { Banknote, Building2, CheckCircle2, Minus, Plus, Printer, Save, ShoppingCart, Trash2, Users, X } from 'lucide-react'

interface Customer {
  id: string
  business_name: string
  contact_name: string
  tax_id: string
  phone: string
  address: string
  has_current_account: boolean
  active: boolean
}
interface Product { id: string; name: string; unit: string; price: number | null; active: boolean }
interface RecipeItem { quantity: number; raw_material?: { unit_price: number } }
interface Recipe { product_id: string; yield_qty: number; items: RecipeItem[] }
interface PriceSetting { markup_pct: number | null; price: number }
interface AccountPayment { id: string; customer_id: string; amount: number; method: string; received_at: string }
interface CartItem { product: Product; quantity: number; unitPrice: number }
type Tab = 'sale' | 'customers' | 'prices'
type Role = 'admin' | 'cashier' | null

const CUSTOMERS_KEY = 'wholesale_customers_v1'
const PRICES_KEY = 'wholesale_prices_v1'
const PAYMENTS_KEY = 'wholesale_account_payments_v1'
const WHOLESALE_MARKER = '__MAYORISTA__:'

const fmt = (value: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value)
const inputCls = 'w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white'
const lineSubtotal = (item: CartItem) => roundUpTo100(item.quantity * item.unitPrice)

export default function WholesalePage() {
  const supabase = createClient()
  const [role, setRole] = useState<Role>(null)
  const [tab, setTab] = useState<Tab>('sale')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [priceSettings, setPriceSettings] = useState<Record<string, PriceSetting>>({})
  const [payments, setPayments] = useState<AccountPayment[]>([])
  const [accountSales, setAccountSales] = useState<Record<string, number>>({})
  const [cashSessionId, setCashSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Transferencia' | 'Cuenta corriente'>('Efectivo')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [lastTransfer, setLastTransfer] = useState<{ id: string; customer: string; total: number; items: CartItem[] } | null>(null)
  const [customerModal, setCustomerModal] = useState<Customer | 'new' | null>(null)
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null)
  const [markupDrafts, setMarkupDrafts] = useState<Record<string, string>>({})
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setMessage('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: roleRow } = user
      ? await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
      : { data: null }
    const nextRole = (roleRow?.role as Role) ?? null
    setRole(nextRole)

    const [storedCustomers, storedPrices, storedPayments, productResult, sessionResult] = await Promise.all([
      readJsonSetting<Customer[]>(supabase, CUSTOMERS_KEY, []),
      readJsonSetting<Record<string, PriceSetting>>(supabase, PRICES_KEY, {}),
      readJsonSetting<AccountPayment[]>(supabase, PAYMENTS_KEY, []),
      supabase.from('products').select('id, name, unit, price, active').eq('active', true).order('name'),
      supabase.from('cash_sessions').select('id').eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const nextProducts = (productResult.data ?? []).map((product) => ({
      ...product,
      price: product.price === null ? null : Number(product.price),
    })) as Product[]
    setCustomers(storedCustomers)
    setProducts(nextProducts)
    setPriceSettings(storedPrices)
    setPayments(storedPayments)
    setCashSessionId(sessionResult.data?.id ?? null)
    setMarkupDrafts(Object.fromEntries(nextProducts.map((product) => [product.id, storedPrices[product.id]?.markup_pct === null || storedPrices[product.id]?.markup_pct === undefined ? '' : String(storedPrices[product.id].markup_pct)])))
    setPriceDrafts(Object.fromEntries(nextProducts.map((product) => [product.id, String(storedPrices[product.id]?.price ?? Number(product.price ?? 0))])))
    setCustomerId((current) => current || storedCustomers.find((customer) => customer.active)?.id || '')

    if (nextRole === 'admin') {
      const [{ data: recipeRows }, { data: salesRows }] = await Promise.all([
        supabase.from('recipes').select('product_id, yield_qty, items:recipe_items(quantity, raw_material:raw_materials(unit_price))'),
        supabase.from('sales').select('total, payment_method, items:sale_items(description)').eq('payment_method', 'Cuenta corriente'),
      ])
      setRecipes((recipeRows ?? []) as unknown as Recipe[])
      const totals: Record<string, number> = {}
      for (const sale of salesRows ?? []) {
        const items = (sale.items ?? []) as unknown as Array<{ description: string }>
        const marker = items.find((item) => item.description.startsWith(WHOLESALE_MARKER))
        const id = marker?.description.slice(WHOLESALE_MARKER.length)
        if (id) totals[id] = (totals[id] ?? 0) + Number(sale.total)
      }
      setAccountSales(totals)
    } else {
      setRecipes([])
      setAccountSales({})
      setTab('sale')
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])

  const isAdmin = role === 'admin'
  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  useEffect(() => {
    if (!selectedCustomer?.has_current_account && paymentMethod === 'Cuenta corriente') setPaymentMethod('Efectivo')
  }, [selectedCustomer, paymentMethod])

  const costFor = useCallback((productId: string) => {
    const recipe = recipes.find((item) => item.product_id === productId)
    if (!recipe) return null
    const total = (recipe.items ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.raw_material?.unit_price ?? 0), 0)
    return Number(recipe.yield_qty) > 0 ? total / Number(recipe.yield_qty) : total
  }, [recipes])

  const wholesalePrice = useCallback((product: Product) => Number(priceSettings[product.id]?.price ?? product.price ?? 0), [priceSettings])
  const total = cart.reduce((sum, item) => sum + lineSubtotal(item), 0)

  const addProduct = (product: Product) => {
    const price = wholesalePrice(product)
    setCart((previous) => {
      const found = previous.find((item) => item.product.id === product.id)
      if (found) return previous.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...previous, { product, quantity: 1, unitPrice: price }]
    })
  }

  const changeQuantity = (productId: string, value: number) => {
    setCart((previous) => previous.flatMap((item) => item.product.id !== productId ? [item] : value > 0 ? [{ ...item, quantity: value }] : []))
  }

  const registerSale = async () => {
    if (!selectedCustomer || cart.length === 0) return
    setSaving(true)
    setMessage('')
    const clientUuid = crypto.randomUUID()
    const items = [
      ...cart.map((item) => ({
        product_id: item.product.id,
        description: item.product.name,
        unit: item.product.unit,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: lineSubtotal(item),
      })),
      { product_id: null, description: `${WHOLESALE_MARKER}${selectedCustomer.id}`, unit: 'meta', quantity: 1, unit_price: 0, subtotal: 0 },
    ]
    const { data, error } = await supabase.rpc('register_sale', {
      p_client_uuid: clientUuid,
      p_cash_session_id: cashSessionId,
      p_payment_method: paymentMethod,
      p_items: items,
    })
    setSaving(false)
    if (error) {
      setMessage(`No se pudo registrar la venta: ${error.message}`)
      return
    }
    if (paymentMethod === 'Transferencia') setLastTransfer({ id: String(data), customer: selectedCustomer.business_name, total, items: [...cart] })
    else setLastTransfer(null)
    setCart([])
    setMessage(paymentMethod === 'Transferencia' ? 'Venta registrada. El comprobante está listo para imprimir.' : 'Venta registrada sin ticket.')
    await load()
  }

  const draftPrice = (product: Product) => {
    const cost = costFor(product.id)
    if (cost === null) return Number((priceDrafts[product.id] ?? '').replace(',', '.')) || 0
    const markup = Number((markupDrafts[product.id] ?? '').replace(',', '.'))
    return cost * (1 + (Number.isFinite(markup) ? markup : 0) / 100)
  }

  const savePrice = async (product: Product) => {
    if (!isAdmin) return
    const cost = costFor(product.id)
    const rawMarkup = markupDrafts[product.id] ?? ''
    const markup = rawMarkup === '' ? null : Number(rawMarkup.replace(',', '.'))
    const price = cost === null
      ? Number((priceDrafts[product.id] ?? '').replace(',', '.'))
      : cost * (1 + (markup ?? 0) / 100)
    if (!Number.isFinite(price) || price < 0 || (markup !== null && (!Number.isFinite(markup) || markup < 0))) return
    const next = { ...priceSettings, [product.id]: { markup_pct: cost === null ? null : markup, price } }
    const error = await writeJsonSetting(supabase, PRICES_KEY, next)
    if (error) setMessage(`No se pudo guardar el precio mayorista: ${error}`)
    else {
      setMessage('Precio mayorista guardado.')
      setPriceSettings(next)
      setPriceDrafts((previous) => ({ ...previous, [product.id]: String(price) }))
    }
  }

  const saveCustomer = async (customer: Customer) => {
    if (!isAdmin) return 'No tenés permisos para modificar clientes.'
    const next = customers.some((item) => item.id === customer.id)
      ? customers.map((item) => item.id === customer.id ? customer : item)
      : [...customers, customer]
    const error = await writeJsonSetting(supabase, CUSTOMERS_KEY, next)
    if (!error) {
      setCustomers(next)
      setCustomerId((current) => current || customer.id)
      setCustomerModal(null)
    }
    return error
  }

  const savePayment = async (payment: AccountPayment) => {
    if (!isAdmin) return 'No tenés permisos para registrar pagos.'
    const next = [...payments, payment]
    const error = await writeJsonSetting(supabase, PAYMENTS_KEY, next)
    if (!error) {
      setPayments(next)
      setPaymentCustomer(null)
    }
    return error
  }

  const balanceFor = (customerIdValue: string) => {
    const paid = payments.filter((payment) => payment.customer_id === customerIdValue).reduce((sum, payment) => sum + Number(payment.amount), 0)
    return (accountSales[customerIdValue] ?? 0) - paid
  }
  const activeProducts = useMemo(() => products.filter((product) => wholesalePrice(product) > 0), [products, wholesalePrice])

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6"><h1 className="font-sans text-3xl font-bold text-charcoal">Mostrador mayorista</h1><p className="font-body text-warm-gray mt-1">Ventas exclusivas a comercios dados de alta, con precios comunes para todos.</p></div>

      {isAdmin && <div className="no-print flex flex-wrap gap-2 mb-6 bg-white border border-border rounded-xl p-1 w-fit">{([['sale', 'Nueva venta', ShoppingCart], ['customers', 'Clientes y cuentas', Users], ['prices', 'Márgenes y precios', Banknote]] as const).map(([value, label, Icon]) => <button key={value} onClick={() => setTab(value)} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-body text-sm font-semibold ${tab === value ? 'bg-burgundy text-cream' : 'text-warm-gray hover:text-charcoal'}`}><Icon size={16} /> {label}</button>)}</div>}

      {message && <div className={`no-print mb-4 px-4 py-3 rounded-xl border font-body text-sm ${message.includes('registrada') || message.includes('guardado') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{message}</div>}

      {loading ? <div className="text-center py-16 text-warm-gray">Cargando...</div> : tab === 'sale' ? (
        <div className="no-print grid lg:grid-cols-[1fr_390px] gap-5">
          <div><div className="bg-white border border-border rounded-2xl p-4 mb-4"><label className="font-body text-xs text-warm-gray uppercase tracking-wide">Comercio</label><select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={`${inputCls} mt-1`}><option value="">— Seleccionar cliente —</option>{customers.filter((customer) => customer.active).map((customer) => <option key={customer.id} value={customer.id}>{customer.business_name}</option>)}</select>{isAdmin && customers.length === 0 && <button onClick={() => setCustomerModal('new')} className="mt-3 text-burgundy font-body text-sm font-semibold hover:underline">Dar de alta el primer comercio</button>}</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{activeProducts.map((product) => <button key={product.id} onClick={() => addProduct(product)} className="text-left bg-white border border-border rounded-2xl p-4 min-h-24 hover:border-burgundy hover:shadow-sm transition-all"><div className="font-body text-sm font-semibold text-charcoal">{product.name}</div><div className="font-num text-base font-bold text-burgundy mt-2">{fmt(wholesalePrice(product))} <span className="font-body text-xs font-normal text-warm-gray">/ {product.unit}</span></div></button>)}</div></div>
          <div className="bg-white rounded-2xl border border-border shadow-sm h-fit lg:sticky lg:top-8"><div className="p-4 border-b border-border font-sans font-bold text-charcoal flex items-center gap-2"><ShoppingCart size={18} /> Pedido mayorista</div><div className="divide-y divide-border/60 max-h-[42vh] overflow-y-auto">{cart.length === 0 ? <p className="p-8 text-center font-body text-sm text-warm-gray">Elegí productos para comenzar.</p> : cart.map((item) => <div key={item.product.id} className="p-3 flex items-center gap-2"><div className="flex-1 min-w-0"><div className="font-body text-sm font-semibold truncate">{item.product.name}</div><div className="font-num text-xs text-warm-gray">{fmt(item.unitPrice)} / {item.product.unit} · Subtotal cobrado {fmt(lineSubtotal(item))}</div></div><button onClick={() => changeQuantity(item.product.id, item.quantity - (item.product.unit === 'kg' ? 0.1 : 1))} className="p-1.5 border border-border rounded"><Minus size={13} /></button><input type="number" min="0.001" step={item.product.unit === 'kg' ? '0.001' : '1'} value={item.quantity} onChange={(event) => changeQuantity(item.product.id, Number(event.target.value))} className="w-20 px-2 py-1.5 text-center border border-border rounded font-num text-sm" /><button onClick={() => changeQuantity(item.product.id, item.quantity + (item.product.unit === 'kg' ? 0.1 : 1))} className="p-1.5 border border-border rounded"><Plus size={13} /></button><button onClick={() => changeQuantity(item.product.id, 0)} className="p-1.5 text-red-500"><Trash2 size={14} /></button></div>)}</div><div className="p-4 border-t border-border"><div className="flex justify-between items-center mb-3"><span className="font-body text-sm text-warm-gray">Total</span><span className="font-num text-3xl font-bold text-burgundy">{fmt(total)}</span></div><label className="font-body text-xs text-warm-gray uppercase tracking-wide">Forma de pago</label><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className={`${inputCls} mt-1 mb-2`}><option>Efectivo</option><option>Transferencia</option>{selectedCustomer?.has_current_account && <option>Cuenta corriente</option>}</select><p className="font-body text-xs text-warm-gray mb-3">{paymentMethod === 'Transferencia' ? 'Esta venta genera comprobante imprimible.' : 'Esta venta se registra sin ticket.'}</p><button onClick={registerSale} disabled={saving || !selectedCustomer || cart.length === 0} className="w-full py-3.5 rounded-xl bg-burgundy text-cream font-body font-bold disabled:opacity-40 hover:bg-burgundy-dark">{saving ? 'Registrando...' : 'Confirmar venta'}</button></div></div>
        </div>
      ) : tab === 'customers' && isAdmin ? (
        <div className="no-print"><div className="flex justify-end mb-4"><button onClick={() => setCustomerModal('new')} className="flex items-center gap-2 px-4 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold"><Plus size={15} /> Nuevo comercio</button></div><div className="bg-white border border-border rounded-2xl overflow-hidden"><table className="w-full"><thead><tr className="bg-cream-dark border-b border-border"><th className="text-left px-4 py-3 text-xs uppercase text-warm-gray">Comercio</th><th className="text-left px-4 py-3 text-xs uppercase text-warm-gray hidden sm:table-cell">Cuenta</th><th className="text-right px-4 py-3 text-xs uppercase text-warm-gray">Debe</th><th className="text-right px-4 py-3 text-xs uppercase text-warm-gray">Acciones</th></tr></thead><tbody>{customers.map((customer) => { const balance = balanceFor(customer.id); return <tr key={customer.id} className="border-b border-border/50"><td className="px-4 py-3"><div className="font-body text-sm font-semibold">{customer.business_name}</div><div className="font-body text-xs text-warm-gray">{customer.contact_name || customer.phone || '—'}</div></td><td className="px-4 py-3 hidden sm:table-cell font-body text-sm">{customer.has_current_account ? 'Cuenta corriente' : 'Sin cuenta'}</td><td className={`px-4 py-3 text-right font-num font-bold ${balance > 0 ? 'text-red-600' : 'text-charcoal'}`}>{fmt(balance)}</td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button onClick={() => setCustomerModal(customer)} className="px-3 py-1.5 border border-border rounded-lg text-xs font-body">Editar</button>{customer.has_current_account && <button onClick={() => setPaymentCustomer(customer)} className="px-3 py-1.5 bg-burgundy/10 text-burgundy rounded-lg text-xs font-body font-semibold">Registrar pago</button>}</div></td></tr> })}</tbody></table></div></div>
      ) : isAdmin ? (
        <div className="no-print bg-white border border-border rounded-2xl overflow-hidden"><div className="p-4 border-b border-border"><p className="font-body text-sm text-warm-gray">Cada producto puede tener su propio margen. Si tiene receta se calcula sobre el costo; si no tiene receta, cargá directamente su precio mayorista.</p></div><table className="w-full"><thead><tr className="bg-cream-dark border-b border-border"><th className="text-left px-4 py-3 text-xs uppercase text-warm-gray">Producto</th><th className="text-right px-4 py-3 text-xs uppercase text-warm-gray hidden sm:table-cell">Costo</th><th className="text-left px-4 py-3 text-xs uppercase text-warm-gray">Margen %</th><th className="text-left px-4 py-3 text-xs uppercase text-warm-gray">Precio mayorista</th><th /></tr></thead><tbody>{products.map((product) => { const cost = costFor(product.id); return <tr key={product.id} className="border-b border-border/50"><td className="px-4 py-3 font-body text-sm font-semibold">{product.name}</td><td className="px-4 py-3 text-right font-num text-sm hidden sm:table-cell">{cost === null ? 'Sin receta' : fmt(cost)}</td><td className="px-4 py-3"><input type="number" min="0" step="any" disabled={cost === null} value={markupDrafts[product.id] ?? ''} onChange={(event) => setMarkupDrafts((previous) => ({ ...previous, [product.id]: event.target.value }))} placeholder={cost === null ? 'No aplica' : '0'} className="w-28 px-3 py-2 border border-border rounded-lg font-num text-sm disabled:bg-cream-dark" /></td><td className="px-4 py-3"><input type="number" min="0" step="any" disabled={cost !== null} value={cost === null ? priceDrafts[product.id] ?? '' : draftPrice(product)} onChange={(event) => setPriceDrafts((previous) => ({ ...previous, [product.id]: event.target.value }))} className="w-32 px-3 py-2 border border-border rounded-lg font-num text-sm disabled:bg-cream-dark" /></td><td className="px-4 py-3 text-right"><button onClick={() => savePrice(product)} className="p-2 border border-border rounded-lg text-burgundy"><Save size={15} /></button></td></tr> })}</tbody></table></div>
      ) : null}

      {lastTransfer && <div className="mt-6"><div className="no-print flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-4 mb-4"><span className="flex items-center gap-2 font-body text-sm text-green-800"><CheckCircle2 size={18} /> Comprobante de transferencia disponible</span><button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-burgundy text-cream rounded-lg font-body text-sm font-semibold"><Printer size={15} /> Imprimir</button></div><div className="print-area hidden print:block bg-white p-8"><h2 className="font-sans text-2xl font-bold">Panadería Villa · Comprobante mayorista</h2><p className="mt-2 font-body">Cliente: {lastTransfer.customer}</p><p className="font-body">Operación: {lastTransfer.id}</p><p className="font-body">Medio de pago: Transferencia</p><table className="w-full mt-6"><tbody>{lastTransfer.items.map((item) => <tr key={item.product.id} className="border-b"><td className="py-2">{item.product.name}</td><td className="py-2 text-right">{item.quantity} {item.product.unit}</td><td className="py-2 text-right">{fmt(lineSubtotal(item))}</td></tr>)}</tbody></table><div className="text-right text-2xl font-bold mt-4">Total {fmt(lastTransfer.total)}</div></div></div>}
      {customerModal && isAdmin && <CustomerModal customer={customerModal} onClose={() => setCustomerModal(null)} onSave={saveCustomer} />}
      {paymentCustomer && isAdmin && <AccountPaymentModal customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} onSave={savePayment} />}
    </div>
  )
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={(event) => event.stopPropagation()}><div className="flex justify-between items-center p-5 border-b border-border"><h2 className="font-sans text-lg font-bold">{title}</h2><button onClick={onClose}><X size={20} /></button></div><div className="p-5 flex flex-col gap-4">{children}</div></div></div>
}

function CustomerModal({ customer, onClose, onSave }: { customer: Customer | 'new'; onClose: () => void; onSave: (customer: Customer) => Promise<string | null> }) {
  const original = customer === 'new' ? null : customer
  const [form, setForm] = useState<Customer>(original ?? { id: crypto.randomUUID(), business_name: '', contact_name: '', tax_id: '', phone: '', address: '', has_current_account: false, active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => { if (!form.business_name.trim()) return; setSaving(true); setError(''); const saveError = await onSave({ ...form, business_name: form.business_name.trim() }); setSaving(false); if (saveError) setError(saveError) }
  return <ModalShell title={original ? 'Editar comercio' : 'Nuevo comercio'} onClose={onClose}>{([['business_name', 'Nombre del comercio *'], ['contact_name', 'Persona de contacto'], ['tax_id', 'CUIT / identificación'], ['phone', 'Teléfono'], ['address', 'Dirección']] as const).map(([field, label]) => <div key={field} className="flex flex-col gap-1"><label className="text-xs uppercase text-warm-gray">{label}</label><input value={form[field]} onChange={(event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))} className={inputCls} /></div>)}<label className="flex items-center gap-2 font-body text-sm"><input type="checkbox" checked={form.has_current_account} onChange={(event) => setForm((previous) => ({ ...previous, has_current_account: event.target.checked }))} className="accent-burgundy" /> Habilitar cuenta corriente</label><label className="flex items-center gap-2 font-body text-sm"><input type="checkbox" checked={form.active} onChange={(event) => setForm((previous) => ({ ...previous, active: event.target.checked }))} className="accent-burgundy" /> Cliente activo</label>{error && <p className="text-sm text-red-600">{error}</p>}<button onClick={save} disabled={saving || !form.business_name.trim()} className="flex items-center justify-center gap-2 py-3 bg-burgundy text-cream rounded-xl font-body font-bold disabled:opacity-50"><Building2 size={16} /> {saving ? 'Guardando...' : 'Guardar comercio'}</button></ModalShell>
}

function AccountPaymentModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (payment: AccountPayment) => Promise<string | null> }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('Transferencia')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = async () => { const value = Number(amount.replace(',', '.')); if (!value || value <= 0) return; setSaving(true); const saveError = await onSave({ id: crypto.randomUUID(), customer_id: customer.id, amount: value, method, received_at: new Date().toISOString() }); setSaving(false); if (saveError) setError(saveError) }
  return <ModalShell title={`Pago de ${customer.business_name}`} onClose={onClose}><div className="flex flex-col gap-1"><label className="text-xs uppercase text-warm-gray">Importe</label><input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputCls} placeholder="Monto recibido" /></div><div className="flex flex-col gap-1"><label className="text-xs uppercase text-warm-gray">Medio</label><select value={method} onChange={(event) => setMethod(event.target.value)} className={inputCls}><option>Transferencia</option><option>Efectivo</option></select></div>{error && <p className="text-sm text-red-600">{error}</p>}<button onClick={save} disabled={saving || !amount} className="py-3 bg-burgundy text-cream rounded-xl font-body font-bold disabled:opacity-50">{saving ? 'Guardando...' : 'Registrar pago'}</button></ModalShell>
}
