'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Scale, Wifi, WifiOff,
  X, DoorOpen, DoorClosed, CheckCircle2, CircleDollarSign, RotateCcw, Star, Cable, EyeOff,
} from 'lucide-react'
import { addPending, removePending, pendingCount, type PendingSale } from '@/lib/pos/queue'
import { syncPending } from '@/lib/pos/sync'
import { cacheProducts, getCachedProducts, cacheSession, getCachedSession } from '@/lib/pos/cache'
import { startScale, isScaleSupported, type ScaleController } from '@/lib/pos/scale'

interface Product {
  id: string
  name: string
  price: number | null
  unit: string
  category: string | null
  featured?: boolean
  active?: boolean   // false = oculto en la web, pero igual se puede vender
}

interface CartItem {
  key: string
  product_id: string
  name: string
  unit: string
  unit_price: number
  quantity: number   // kg o unidades
  subtotal: number
}

interface CashSession {
  id: string
  opening_float: number
  opened_at: string
}

const PAYMENT_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'QR']

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
const fmtKg = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg`

export default function PosPage() {
  const supabase = createClient()

  const [userId, setUserId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [letter, setLetter] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [session, setSession] = useState<CashSession | null>(null)

  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)

  // Balanza
  const [scaleSupported, setScaleSupported] = useState(false)
  const [scaleConnected, setScaleConnected] = useState(false)
  const [liveWeight, setLiveWeight] = useState<number | null>(null)
  const scaleRef = useRef<ScaleController | null>(null)

  // Modales
  const [weighing, setWeighing] = useState<Product | null>(null)
  const [weightInput, setWeightInput] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [openCajaModal, setOpenCajaModal] = useState(false)
  const [floatInput, setFloatInput] = useState('')
  const [closeCajaModal, setCloseCajaModal] = useState(false)
  const [flash, setFlash] = useState('')
  const [lastSale, setLastSale] = useState<{ client_uuid: string; total: number; method: string } | null>(null)

  const refreshPending = useCallback(() => setPending(pendingCount()), [])

  const trySync = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    await syncPending(supabase)
    refreshPending()
  }, [supabase, refreshPending])

  // Carga inicial
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUserId(user?.id ?? null)

        const [{ data: prods, error: prodErr }, { data: sessions }] = await Promise.all([
          // Sin filtro de "active": el mostrador vende también los ocultos (con precio).
          supabase.from('products').select('id, name, price, unit, category, featured, active').order('name'),
          supabase.from('cash_sessions').select('id, opening_float, opened_at').eq('status', 'open').order('opened_at', { ascending: false }).limit(1),
        ])

        if (prodErr) throw prodErr
        const list = ((prods ?? []).filter(p => p.price !== null) as Product[])
          // Destacados primero (funcionan como "favoritos" del mostrador).
          .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
        setProducts(list)
        cacheProducts(list)                          // guardo para modo offline

        const openSession = (sessions && sessions[0]) ? (sessions[0] as CashSession) : null
        setSession(openSession)
        cacheSession(openSession)
      } catch {
        // Sin conexión: uso lo último cacheado para poder trabajar igual.
        setProducts(getCachedProducts<Product>())
        setSession(getCachedSession<CashSession>())
      } finally {
        setLoading(false)
        refreshPending()
        trySync()
      }
    }
    init()
  }, [supabase, refreshPending, trySync])

  // Estado de conexión
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    const onOnline = () => { setOnline(true); trySync() }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [trySync])

  // Balanza: soporte + autoconexión (si el puerto ya fue autorizado antes).
  const connectScale = useCallback(async (reuse: boolean) => {
    if (scaleRef.current) return
    const ctrl = await startScale({
      reusePort: reuse,
      onWeight: (kg) => setLiveWeight(kg),
      onStatus: (c) => setScaleConnected(c),
    })
    if (ctrl) scaleRef.current = ctrl
  }, [])

  useEffect(() => {
    const supported = isScaleSupported()
    setScaleSupported(supported)
    if (supported) connectScale(true)
    return () => {
      scaleRef.current?.stop()
      scaleRef.current = null
    }
  }, [connectScale])

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3000)
  }

  // ── Carrito ───────────────────────────────────────────────
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const filtered = useMemo(
    () => products.filter(p => {
      const matchesSearch = norm(`${p.name} ${p.category ?? ''}`).includes(norm(search))
      const matchesLetter = !letter || norm(p.name).trimStart().startsWith(norm(letter))
      return matchesSearch && matchesLetter
    }),
    [products, search, letter]
  )
  // Letras que realmente tienen productos (las demás quedan deshabilitadas).
  const availableLetters = useMemo(() => {
    const set = new Set<string>()
    for (const p of products) {
      const c = norm(p.name).trimStart().charAt(0).toUpperCase()
      if (c) set.add(c)
    }
    return set
  }, [products])

  const addUnitProduct = (p: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product_id === p.id && i.unit !== 'kg')
      if (existing) {
        return prev.map(i => i === existing
          ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
          : i)
      }
      return [...prev, {
        key: crypto.randomUUID(), product_id: p.id, name: p.name, unit: p.unit,
        unit_price: p.price!, quantity: 1, subtotal: p.price!,
      }]
    })
  }

  const handleProductClick = (p: Product) => {
    if (p.unit === 'kg') {
      setWeighing(p)
      // Si la balanza está conectada, prellenamos con el peso actual.
      setWeightInput(scaleConnected && liveWeight != null ? String(liveWeight) : '')
    } else {
      addUnitProduct(p)
    }
  }

  const confirmWeight = () => {
    if (!weighing) return
    const kg = Number(weightInput.replace(',', '.'))
    if (!kg || kg <= 0) return
    setCart(prev => [...prev, {
      key: crypto.randomUUID(), product_id: weighing.id, name: weighing.name, unit: 'kg',
      unit_price: weighing.price!, quantity: kg, subtotal: kg * weighing.price!,
    }])
    setWeighing(null)
    setWeightInput('')
  }

  const changeQty = (key: string, delta: number) => {
    setCart(prev => prev.flatMap(i => {
      if (i.key !== key) return [i]
      const q = i.quantity + delta
      if (q <= 0) return []
      return [{ ...i, quantity: q, subtotal: q * i.unit_price }]
    }))
  }

  const removeItem = (key: string) => setCart(prev => prev.filter(i => i.key !== key))
  const clearCart = () => setCart([])

  const total = useMemo(() => cart.reduce((s, i) => s + i.subtotal, 0), [cart])

  // ── Caja ──────────────────────────────────────────────────
  const openCaja = async () => {
    if (!userId) return
    const opening = Number(floatInput.replace(',', '.')) || 0
    const { data } = await supabase
      .from('cash_sessions')
      .insert({ opened_by: userId, opening_float: opening, status: 'open' })
      .select('id, opening_float, opened_at')
      .single()
    if (data) {
      setSession(data as CashSession)
      cacheSession(data as CashSession)
    }
    setOpenCajaModal(false)
    setFloatInput('')
  }

  // ── Cobrar ────────────────────────────────────────────────
  const charge = async (method: string) => {
    if (cart.length === 0 || !session) return
    const sale: PendingSale = {
      client_uuid: crypto.randomUUID(),
      cash_session_id: session.id,
      payment_method: method,
      items: cart.map(i => ({
        product_id: i.product_id,
        description: i.name,
        unit: i.unit,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
      })),
      created_at: new Date().toISOString(),
    }
    const saleTotal = sale.items.reduce((s, x) => s + x.subtotal, 0)
    addPending(sale)          // 1) guardado local inmediato (nunca se pierde)
    refreshPending()
    clearCart()
    setPayOpen(false)
    setLastSale({ client_uuid: sale.client_uuid, total: saleTotal, method })
    trySync()                 // 2) intento de sincronización
  }

  const undoLastSale = async () => {
    if (!lastSale) return
    removePending(lastSale.client_uuid)   // si todavía no se subió, la saca de la cola
    refreshPending()
    try {
      await supabase.rpc('void_sale', { p_client_uuid: lastSale.client_uuid }) // si ya se subió, la revierte
    } catch {
      /* si estamos offline, quedó fuera de la cola; al reconectar no se sube */
    }
    setLastSale(null)
    showFlash('Última venta anulada.')
  }

  if (loading) {
    return <div className="text-center py-20 text-warm-gray font-body">Cargando mostrador...</div>
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Barra superior: caja + conexión */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-sans text-2xl font-bold text-charcoal">Mostrador</h1>
          {session ? (
            <p className="font-body text-xs text-warm-gray mt-0.5">
              Caja abierta · fondo inicial {fmtARS(session.opening_float)}
            </p>
          ) : (
            <p className="font-body text-xs text-warm-gray mt-0.5">Caja cerrada</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-body text-xs font-medium ${
            online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            {online ? 'En línea' : 'Sin conexión'}
          </span>
          {pending > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 font-body text-xs font-medium">
              {pending} por subir
            </span>
          )}
          {scaleSupported && (scaleConnected ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 text-green-700 font-body text-xs font-medium">
              <Scale size={13} /> Balanza{liveWeight != null ? ` · ${liveWeight.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg` : ''}
            </span>
          ) : (
            <button onClick={() => connectScale(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-warm-gray hover:text-charcoal font-body text-xs font-medium transition-colors">
              <Cable size={13} /> Conectar balanza
            </button>
          ))}
          {session ? (
            <button onClick={() => setCloseCajaModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-charcoal font-body text-xs font-semibold hover:bg-cream transition-colors">
              <DoorClosed size={14} /> Cerrar caja
            </button>
          ) : (
            <button onClick={() => setOpenCajaModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-burgundy text-cream font-body text-xs font-semibold hover:bg-burgundy-dark transition-colors">
              <DoorOpen size={14} /> Abrir caja
            </button>
          )}
        </div>
      </div>

      {flash && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      {lastSale && (
        <div className="mb-4 flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={18} /> Última venta registrada · {fmtARS(lastSale.total)} · {lastSale.method}
          </span>
          <button onClick={undoLastSale} className="flex items-center gap-1 text-red-600 hover:underline font-semibold">
            <RotateCcw size={14} /> Deshacer
          </button>
        </div>
      )}

      {!session ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-border">
          <CircleDollarSign size={40} className="mx-auto text-warm-gray mb-3" />
          <p className="font-body text-warm-gray mb-4">Abrí la caja para empezar a vender.</p>
          <button onClick={() => setOpenCajaModal(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors">
            <DoorOpen size={16} /> Abrir caja
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5">
          {/* Selector de productos */}
          <div>
            <div className="relative mb-3">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" />
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full pl-10 pr-3 py-3 border border-border rounded-xl font-body text-base focus:outline-none focus:border-burgundy bg-white"
              />
            </div>

            {/* Barra de letras: tocá una letra para ver los que empiezan con ella */}
            <div className="flex flex-wrap gap-1 mb-4">
              <button
                onClick={() => setLetter(null)}
                className={`px-2.5 h-8 min-w-8 rounded-lg font-body text-xs font-bold transition-colors ${letter === null ? 'bg-burgundy text-cream' : 'bg-white text-warm-gray border border-border hover:text-charcoal'}`}
              >
                Todos
              </button>
              {'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('').map(l => {
                const has = availableLetters.has(l)
                const active = letter === l
                return (
                  <button
                    key={l}
                    onClick={() => setLetter(active ? null : l)}
                    disabled={!has}
                    className={`h-8 w-8 rounded-lg font-body text-sm font-bold transition-colors ${
                      active ? 'bg-burgundy text-cream'
                      : has ? 'bg-white text-charcoal border border-border hover:border-burgundy hover:text-burgundy'
                      : 'bg-transparent text-warm-gray/30 cursor-default'
                    }`}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="relative flex flex-col items-start justify-between text-left p-4 bg-white rounded-2xl border border-border hover:border-burgundy hover:shadow-md transition-all min-h-[92px]"
                >
                  {p.featured && <Star size={13} className="absolute top-2 right-2 text-gold fill-gold" />}
                  <span className="font-body text-sm font-semibold text-charcoal leading-snug line-clamp-2 pr-4">{p.name}</span>
                  {p.active === false && (
                    <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warm-gray/10 text-warm-gray font-body text-[10px] font-medium">
                      <EyeOff size={10} /> No público
                    </span>
                  )}
                  <span className="mt-2 flex items-center gap-1.5">
                    <span className="font-sans text-base font-bold text-burgundy">{fmtARS(p.price!)}</span>
                    <span className="font-body text-xs text-warm-gray">{p.unit === 'kg' ? '/ kg' : 'c/u'}</span>
                    {p.unit === 'kg' && <Scale size={13} className="text-warm-gray" />}
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-10 text-warm-gray font-body text-sm">Sin resultados.</div>
              )}
            </div>
          </div>

          {/* Carrito */}
          <div className="bg-white rounded-2xl border border-border shadow-sm flex flex-col h-fit lg:sticky lg:top-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="flex items-center gap-2 font-sans font-bold text-charcoal">
                <ShoppingCart size={18} /> Carrito
              </span>
              {cart.length > 0 && (
                <button onClick={clearCart} className="font-body text-xs text-warm-gray hover:text-red-500 transition-colors">
                  Vaciar
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto max-h-[46vh] divide-y divide-border/60">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-warm-gray font-body text-sm px-4">
                  Tocá un producto para agregarlo.
                </div>
              ) : cart.map(i => (
                <div key={i.key} className="flex items-center gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-charcoal truncate">{i.name}</div>
                    <div className="font-body text-xs text-warm-gray">
                      {i.unit === 'kg' ? `${fmtKg(i.quantity)} × ${fmtARS(i.unit_price)}/kg` : `${i.quantity} × ${fmtARS(i.unit_price)}`}
                    </div>
                  </div>
                  {i.unit !== 'kg' && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(i.key, -1)} className="p-1 rounded-md border border-border text-warm-gray hover:text-charcoal"><Minus size={13} /></button>
                      <button onClick={() => changeQty(i.key, 1)} className="p-1 rounded-md border border-border text-warm-gray hover:text-charcoal"><Plus size={13} /></button>
                    </div>
                  )}
                  <div className="w-20 text-right font-body text-sm font-bold text-charcoal">{fmtARS(i.subtotal)}</div>
                  <button onClick={() => removeItem(i.key)} className="p-1 text-warm-gray hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-body text-sm text-warm-gray">Total</span>
                <span className="font-sans text-2xl font-bold text-burgundy">{fmtARS(total)}</span>
              </div>
              <button
                onClick={() => setPayOpen(true)}
                disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-burgundy text-cream rounded-xl font-body text-base font-bold hover:bg-burgundy-dark disabled:opacity-40 transition-colors"
              >
                <CircleDollarSign size={20} /> Cobrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: pesar */}
      {weighing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setWeighing(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><Scale size={18} /> Pesar</h2>
              <button onClick={() => setWeighing(null)} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div>
                <div className="font-body text-sm font-semibold text-charcoal">{weighing.name}</div>
                <div className="font-body text-xs text-warm-gray">{fmtARS(weighing.price!)} / kg</div>
              </div>
              {scaleConnected && (
                <div className="flex items-center justify-between gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="flex items-center gap-2 font-body text-sm text-green-800">
                    <Scale size={16} /> Balanza: <b>{liveWeight != null ? `${liveWeight.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg` : '—'}</b>
                  </span>
                  <button
                    onClick={() => liveWeight != null && setWeightInput(String(liveWeight))}
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white font-body text-xs font-semibold hover:bg-green-700 transition-colors">
                    Usar peso
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Peso en kg</label>
                <input
                  type="number" inputMode="decimal" min="0" step="0.001" autoFocus
                  value={weightInput}
                  onChange={e => setWeightInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmWeight() }}
                  placeholder="Ej: 0.500"
                  className="px-4 py-3 border border-border rounded-xl font-body text-lg focus:outline-none focus:border-burgundy"
                />
                {!scaleConnected && (
                  <span className="font-body text-xs text-warm-gray mt-1">
                    Cuando conectes la balanza (botón “Conectar balanza”), el peso se completa solo.
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between bg-cream-dark rounded-xl px-4 py-3">
                <span className="font-body text-sm text-warm-gray">Subtotal</span>
                <span className="font-sans text-xl font-bold text-burgundy">
                  {fmtARS((Number(weightInput.replace(',', '.')) || 0) * weighing.price!)}
                </span>
              </div>
              <button onClick={confirmWeight}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark transition-colors">
                <Plus size={16} /> Agregar al carrito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cobrar (elegir medio de pago) */}
      {payOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPayOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-sans text-lg font-bold text-charcoal">Cobrar {fmtARS(total)}</h2>
              <button onClick={() => setPayOpen(false)} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
            </div>
            <div className="p-5">
              <p className="font-body text-xs text-warm-gray uppercase tracking-wide mb-3">¿Cómo pagó?</p>
              <div className="grid grid-cols-2 gap-3">
                {PAYMENT_METHODS.map(m => (
                  <button key={m} onClick={() => charge(m)}
                    className="px-4 py-4 rounded-xl border-2 border-burgundy/20 bg-white text-charcoal font-body text-base font-semibold hover:bg-burgundy hover:text-cream hover:border-burgundy transition-colors">
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: abrir caja */}
      {openCajaModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpenCajaModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><DoorOpen size={18} /> Abrir caja</h2>
              <button onClick={() => setOpenCajaModal(false)} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Fondo inicial en efectivo</label>
                <input
                  type="number" inputMode="decimal" min="0" step="any" autoFocus
                  value={floatInput}
                  onChange={e => setFloatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') openCaja() }}
                  placeholder="0"
                  className="px-4 py-3 border border-border rounded-xl font-body text-lg focus:outline-none focus:border-burgundy"
                />
              </div>
              <button onClick={openCaja}
                className="w-full px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark transition-colors">
                Abrir caja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cerrar caja */}
      {closeCajaModal && session && (
        <CloseCajaModal
          supabase={supabase}
          session={session}
          userId={userId}
          onClose={() => setCloseCajaModal(false)}
          onClosed={() => { setSession(null); cacheSession(null); setCloseCajaModal(false); showFlash('Caja cerrada.') }}
          syncFirst={trySync}
        />
      )}
    </div>
  )
}

// ── Cierre de caja (componente aparte) ──────────────────────
function CloseCajaModal({
  supabase, session, userId, onClose, onClosed, syncFirst,
}: {
  supabase: ReturnType<typeof createClient>
  session: CashSession
  userId: string | null
  onClose: () => void
  onClosed: () => void
  syncFirst: () => Promise<void>
}) {
  const [loading, setLoading] = useState(true)
  const [byMethod, setByMethod] = useState<Record<string, number>>({})
  const [count, setCount] = useState(0)
  const [ticketAvg, setTicketAvg] = useState(0)
  const [topProduct, setTopProduct] = useState<string>('')
  const [counted, setCounted] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      await syncFirst() // subir pendientes antes de calcular
      const [{ data: salesData }, { data: itemsData }] = await Promise.all([
        supabase.from('sales').select('id, total, payment_method').eq('cash_session_id', session.id),
        supabase.from('sale_items').select('description, quantity, sales!inner(cash_session_id)').eq('sales.cash_session_id', session.id),
      ])
      const rows = salesData ?? []
      const map: Record<string, number> = {}
      for (const r of rows) map[r.payment_method ?? '—'] = (map[r.payment_method ?? '—'] ?? 0) + Number(r.total)
      setByMethod(map)
      setCount(rows.length)
      const sum = rows.reduce((s, r) => s + Number(r.total), 0)
      setTicketAvg(rows.length ? sum / rows.length : 0)

      // Producto más vendido (por cantidad).
      const qtyByProduct: Record<string, number> = {}
      for (const it of itemsData ?? []) {
        qtyByProduct[it.description] = (qtyByProduct[it.description] ?? 0) + Number(it.quantity)
      }
      const top = Object.entries(qtyByProduct).sort((a, b) => b[1] - a[1])[0]
      setTopProduct(top ? top[0] : '—')

      setLoading(false)
    }
    load()
  }, [supabase, session.id, syncFirst])

  const totalSales = Object.values(byMethod).reduce((s, n) => s + n, 0)
  const cashSales = byMethod['Efectivo'] ?? 0
  const expectedCash = session.opening_float + cashSales
  const countedNum = Number(counted.replace(',', '.')) || 0
  const diff = counted !== '' ? countedNum - expectedCash : 0
  const fmt = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const doClose = async () => {
    setSaving(true)
    await supabase.from('cash_sessions').update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: userId,
      counted_cash: counted !== '' ? countedNum : null,
    }).eq('id', session.id)
    onClosed()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-white">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><DoorClosed size={18} /> Cierre de caja</h2>
          <button onClick={onClose} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-warm-gray font-body">Calculando...</div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-cream-dark rounded-xl p-3">
                <div className="font-body text-xs text-warm-gray">Ventas</div>
                <div className="font-sans text-xl font-bold text-charcoal">{count}</div>
              </div>
              <div className="bg-cream-dark rounded-xl p-3">
                <div className="font-body text-xs text-warm-gray">Ticket promedio</div>
                <div className="font-sans text-xl font-bold text-charcoal">{fmt(ticketAvg)}</div>
              </div>
            </div>

            {topProduct && topProduct !== '—' && (
              <div className="bg-cream-dark rounded-xl p-3 flex items-center justify-between">
                <span className="font-body text-xs text-warm-gray">Más vendido</span>
                <span className="font-body text-sm font-semibold text-charcoal">{topProduct}</span>
              </div>
            )}

            <div className="border border-border rounded-xl divide-y divide-border/60">
              {Object.entries(byMethod).length === 0 ? (
                <div className="px-4 py-3 font-body text-sm text-warm-gray text-center">Sin ventas en esta caja.</div>
              ) : Object.entries(byMethod).map(([m, v]) => (
                <div key={m} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-body text-sm text-charcoal">{m}</span>
                  <span className="font-body text-sm font-semibold text-charcoal">{fmt(v)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2.5 bg-cream/50">
                <span className="font-body text-sm font-bold text-charcoal">Total vendido</span>
                <span className="font-body text-sm font-bold text-burgundy">{fmt(totalSales)}</span>
              </div>
            </div>

            <div className="bg-cream-dark rounded-xl p-4 flex flex-col gap-2">
              <div className="flex justify-between font-body text-sm text-warm-gray">
                <span>Fondo inicial</span><span>{fmt(session.opening_float)}</span>
              </div>
              <div className="flex justify-between font-body text-sm text-warm-gray">
                <span>+ Ventas en efectivo</span><span>{fmt(cashSales)}</span>
              </div>
              <div className="flex justify-between font-body text-sm font-semibold text-charcoal border-t border-border pt-2">
                <span>Efectivo esperado</span><span>{fmt(expectedCash)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Efectivo contado (opcional)</label>
              <input
                type="number" inputMode="decimal" min="0" step="any"
                value={counted} onChange={e => setCounted(e.target.value)}
                placeholder="Contá la caja y anotá acá"
                className="px-4 py-3 border border-border rounded-xl font-body text-base focus:outline-none focus:border-burgundy"
              />
              {counted !== '' && (
                <span className={`font-body text-sm mt-1 font-semibold ${diff === 0 ? 'text-green-700' : diff > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {diff === 0 ? 'Cuadra exacto ✓' : diff > 0 ? `Sobra ${fmt(diff)}` : `Falta ${fmt(-diff)}`}
                </span>
              )}
            </div>

            <button onClick={doClose} disabled={saving}
              className="w-full px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-50 transition-colors">
              {saving ? 'Cerrando...' : 'Cerrar caja'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
