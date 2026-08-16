'use client'

/**
 * Mostrador (POS).
 *
 * Pensado para vender rápido con teclado y mouse:
 *   · La balanza se lee sola: al pesar, el peso entra en vivo y no hay que
 *     apretar ningún botón para "tomarlo". Sólo se confirma con Enter.
 *   · La barra de balanza queda siempre a la vista con el peso del plato.
 *   · Atajos: escribir busca, Enter agrega, F2 cobra, F4 monto libre, Esc limpia.
 *   · Al cobrar en efectivo se calcula el vuelto.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Scale, Wifi, WifiOff,
  X, DoorOpen, DoorClosed, CheckCircle2, CircleDollarSign, RotateCcw, Star, Cable, EyeOff,
  Keyboard, Banknote, ArrowLeft, Coins, AlertTriangle,
} from 'lucide-react'
import { addPending, removePending, pendingCount, type PendingSale } from '@/lib/pos/queue'
import { syncPending } from '@/lib/pos/sync'
import { cacheProducts, getCachedProducts, cacheSession, getCachedSession } from '@/lib/pos/cache'
import { useScale, EMPTY_KG, type ScaleState } from '@/hooks/use-scale'

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
  product_id: string | null
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
/** Peso con 3 decimales fijos, como lo muestra el visor de la balanza. */
const fmtKgFixed = (n: number) =>
  `${n.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
const parseNum = (s: string) => Number(s.replace(',', '.'))

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

  const scale = useScale()

  // Modales
  const [weighing, setWeighing] = useState<Product | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [freeOpen, setFreeOpen] = useState(false)
  const [openCajaModal, setOpenCajaModal] = useState(false)
  const [floatInput, setFloatInput] = useState('')
  const [closeCajaModal, setCloseCajaModal] = useState(false)
  const [flash, setFlash] = useState('')
  const [lastSale, setLastSale] = useState<
    { client_uuid: string; total: number; method: string; change: number | null } | null
  >(null)

  const searchRef = useRef<HTMLInputElement>(null)

  const anyModalOpen = Boolean(weighing) || payOpen || freeOpen || openCajaModal || closeCajaModal

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

  const showFlash = (msg: string) => {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3000)
  }

  /** Devuelve el foco al buscador: después de cada acción se puede seguir tipeando. */
  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => searchRef.current?.focus())
  }, [])

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

  // Cuánto hay ya cargado de cada producto (se muestra como globo en la tarjeta).
  const inCart = useMemo(() => {
    const map = new Map<string, { qty: number; unit: string }>()
    for (const i of cart) {
      if (!i.product_id) continue
      const prev = map.get(i.product_id)
      map.set(i.product_id, { qty: (prev?.qty ?? 0) + i.quantity, unit: i.unit })
    }
    return map
  }, [cart])

  const addUnitProduct = useCallback((p: Product) => {
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
  }, [])

  const handleProductClick = useCallback((p: Product) => {
    if (p.unit === 'kg') {
      setWeighing(p)
    } else {
      addUnitProduct(p)
      setSearch('')
      focusSearch()
    }
  }, [addUnitProduct, focusSearch])

  const addWeighed = (p: Product, kg: number) => {
    setCart(prev => [...prev, {
      key: crypto.randomUUID(), product_id: p.id, name: p.name, unit: 'kg',
      unit_price: p.price!, quantity: kg, subtotal: kg * p.price!,
    }])
    setWeighing(null)
    setSearch('')
    focusSearch()
  }

  const addFreeAmount = (desc: string, amount: number) => {
    setCart(prev => [...prev, {
      key: crypto.randomUUID(), product_id: null, name: desc || 'Varios',
      unit: 'unidad', unit_price: amount, quantity: 1, subtotal: amount,
    }])
    setFreeOpen(false)
    focusSearch()
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

  // ── Atajos de teclado ─────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModalOpen) return
      const el = e.target as HTMLElement | null
      const typing = !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)

      if (e.key === 'F2') {
        e.preventDefault()
        if (cart.length > 0 && session) setPayOpen(true)
        return
      }
      if (e.key === 'F4') {
        e.preventDefault()
        if (session) setFreeOpen(true)
        return
      }
      if (e.key === 'Escape') {
        setSearch('')
        setLetter(null)
        focusSearch()
        return
      }
      // Cualquier tecla imprimible manda el foco al buscador: se puede
      // empezar a escribir el producto sin tocar el mouse.
      if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyModalOpen, cart.length, session, focusSearch])

  // Foco inicial en el buscador apenas hay caja abierta.
  useEffect(() => {
    if (!loading && session && !anyModalOpen) focusSearch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session])

  // ── Caja ──────────────────────────────────────────────────
  const openCaja = async () => {
    if (!userId) return
    const opening = parseNum(floatInput) || 0
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
    focusSearch()
  }

  // ── Cobrar ────────────────────────────────────────────────
  const charge = async (method: string, change: number | null) => {
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
    setLastSale({ client_uuid: sale.client_uuid, total: saleTotal, method, change })
    focusSearch()
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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

      {/* Balanza siempre a la vista */}
      {session && (
        <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-3 bg-cream-dark/95 backdrop-blur-sm">
          <ScaleBar scale={scale} />
        </div>
      )}

      {flash && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">
          <CheckCircle2 size={18} /> {flash}
        </div>
      )}

      {lastSale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 font-body text-sm">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={18} /> Venta registrada · {fmtARS(lastSale.total)} · {lastSale.method}
          </span>
          {lastSale.change != null && lastSale.change > 0 && (
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-green-300 font-num text-base font-bold text-green-800">
              <Coins size={16} /> Vuelto {fmtARS(lastSale.change)}
            </span>
          )}
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
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text" value={search} onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && filtered.length > 0) {
                      e.preventDefault()
                      handleProductClick(filtered[0])
                    }
                  }}
                  placeholder="Buscar producto y Enter para agregar..."
                  className="w-full pl-10 pr-3 py-3 border border-border rounded-xl font-body text-base focus:outline-none focus:border-burgundy bg-white"
                />
                {search && (
                  <button onClick={() => { setSearch(''); focusSearch() }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button onClick={() => setFreeOpen(true)}
                title="Cobrar un importe suelto (F4)"
                className="flex items-center gap-1.5 px-4 rounded-xl border border-border bg-white text-charcoal font-body text-sm font-semibold hover:border-burgundy hover:text-burgundy transition-colors whitespace-nowrap">
                <Banknote size={16} /> Monto libre
              </button>
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
              {filtered.map((p, idx) => {
                const loaded = inCart.get(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => handleProductClick(p)}
                    className={`relative flex flex-col items-start justify-between text-left p-4 bg-white rounded-2xl border transition-all min-h-[92px] hover:border-burgundy hover:shadow-md ${
                      idx === 0 && search ? 'border-burgundy ring-2 ring-burgundy/20' : 'border-border'
                    }`}
                  >
                    {p.featured && !loaded && <Star size={13} className="absolute top-2 right-2 text-gold fill-gold" />}
                    {loaded && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-burgundy text-cream font-body text-[10px] font-bold">
                        {p.unit === 'kg' ? fmtKg(loaded.qty) : `${loaded.qty}`}
                      </span>
                    )}
                    <span className="font-body text-sm font-semibold text-charcoal leading-snug line-clamp-2 pr-8">{p.name}</span>
                    {p.active === false && (
                      <span className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warm-gray/10 text-warm-gray font-body text-[10px] font-medium">
                        <EyeOff size={10} /> No público
                      </span>
                    )}
                    <span className="mt-2 flex items-center gap-1.5">
                      <span className="font-num text-base font-bold text-burgundy">{fmtARS(p.price!)}</span>
                      <span className="font-body text-xs text-warm-gray">{p.unit === 'kg' ? '/ kg' : 'c/u'}</span>
                      {p.unit === 'kg' && <Scale size={13} className="text-warm-gray" />}
                    </span>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <div className="col-span-full text-center py-10 text-warm-gray font-body text-sm">Sin resultados.</div>
              )}
            </div>

            {/* Ayuda de atajos */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-[11px] text-warm-gray">
              <span className="flex items-center gap-1.5"><Keyboard size={13} /> Atajos:</span>
              <span><Tecla>Escribí</Tecla> busca</span>
              <span><Tecla>Enter</Tecla> agrega el primero</span>
              <span><Tecla>F2</Tecla> cobrar</span>
              <span><Tecla>F4</Tecla> monto libre</span>
              <span><Tecla>Esc</Tecla> limpiar</span>
            </div>
          </div>

          {/* Carrito */}
          <div className="bg-white rounded-2xl border border-border shadow-sm flex flex-col h-fit lg:sticky lg:top-28">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="flex items-center gap-2 font-sans font-bold text-charcoal">
                <ShoppingCart size={18} /> Carrito
                {cart.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-cream-dark font-body text-xs text-warm-gray">{cart.length}</span>
                )}
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
                  Buscá o tocá un producto para agregarlo.
                </div>
              ) : cart.map(i => (
                <div key={i.key} className="flex items-center gap-2 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-body text-sm font-semibold text-charcoal truncate">{i.name}</div>
                    <div className="font-num text-xs text-warm-gray">
                      {i.unit === 'kg' ? `${fmtKg(i.quantity)} × ${fmtARS(i.unit_price)}/kg` : `${i.quantity} × ${fmtARS(i.unit_price)}`}
                    </div>
                  </div>
                  {i.unit !== 'kg' && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(i.key, -1)} className="p-1 rounded-md border border-border text-warm-gray hover:text-charcoal"><Minus size={13} /></button>
                      <button onClick={() => changeQty(i.key, 1)} className="p-1 rounded-md border border-border text-warm-gray hover:text-charcoal"><Plus size={13} /></button>
                    </div>
                  )}
                  <div className="w-20 text-right font-num text-sm font-bold text-charcoal">{fmtARS(i.subtotal)}</div>
                  <button onClick={() => removeItem(i.key)} className="p-1 text-warm-gray hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-body text-sm text-warm-gray">Total</span>
                <span className="font-num text-3xl font-bold text-burgundy">{fmtARS(total)}</span>
              </div>
              <button
                onClick={() => setPayOpen(true)}
                disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-burgundy text-cream rounded-xl font-body text-base font-bold hover:bg-burgundy-dark disabled:opacity-40 transition-colors"
              >
                <CircleDollarSign size={20} /> Cobrar <span className="font-normal opacity-70 text-xs">(F2)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: pesar */}
      {weighing && (
        <WeighModal
          key={weighing.id}
          product={weighing}
          scale={scale}
          onCancel={() => { setWeighing(null); focusSearch() }}
          onConfirm={kg => addWeighed(weighing, kg)}
        />
      )}

      {/* Modal: cobrar */}
      {payOpen && (
        <PayModal
          total={total}
          onCancel={() => { setPayOpen(false); focusSearch() }}
          onCharge={charge}
        />
      )}

      {/* Modal: monto libre */}
      {freeOpen && (
        <FreeAmountModal
          onCancel={() => { setFreeOpen(false); focusSearch() }}
          onConfirm={addFreeAmount}
        />
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

// ── Piezas de interfaz ──────────────────────────────────────

function Tecla({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-white font-body text-[10px] font-semibold text-charcoal">
      {children}
    </kbd>
  )
}

/**
 * Barra de balanza: el peso del plato siempre a la vista, con el estado de la
 * lectura. Es la referencia visual del cajero — si acá se ve el peso, el
 * modal de pesar lo va a tomar solo.
 */
function ScaleBar({ scale }: { scale: ScaleState }) {
  if (!scale.supported) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-border font-body text-xs text-warm-gray">
        <AlertTriangle size={14} className="text-amber-500" />
        Este navegador no lee la balanza. Para usarla, abrí el mostrador en Chrome o Edge de escritorio.
      </div>
    )
  }

  if (!scale.connected) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-border">
        <span className="flex items-center gap-2 font-body text-sm text-warm-gray">
          <Scale size={18} /> Balanza desconectada — se puede vender igual escribiendo el peso a mano.
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => scale.connect(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-burgundy text-cream font-body text-xs font-bold hover:bg-burgundy-dark transition-colors">
            <Cable size={14} /> Conectar balanza
          </button>
          <Link href="/admin/pos/balanza"
            className="px-3 py-1.5 rounded-lg border border-border text-warm-gray hover:text-charcoal font-body text-xs transition-colors">
            Diagnóstico
          </Link>
        </div>
      </div>
    )
  }

  const estado = !scale.live
    ? { txt: 'Sin lectura', cls: 'bg-red-100 text-red-700' }
    : !scale.hasLoad
      ? { txt: 'Plato vacío', cls: 'bg-warm-gray/10 text-warm-gray' }
      : scale.stable
        ? { txt: 'Peso estable', cls: 'bg-green-100 text-green-700' }
        : { txt: 'Estabilizando…', cls: 'bg-amber-100 text-amber-700' }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white border shadow-sm transition-colors ${
      scale.stable && scale.hasLoad ? 'border-green-300' : 'border-border'
    }`}>
      <div className="flex items-center gap-3">
        <Scale size={20} className={scale.live ? 'text-green-600' : 'text-red-500'} />
        <span className={`font-num text-2xl font-bold ${scale.live ? 'text-charcoal' : 'text-warm-gray/50'}`}>
          {scale.weight != null && scale.live ? fmtKgFixed(scale.weight) : '—'}
        </span>
        <span className={`px-2.5 py-1 rounded-full font-body text-[11px] font-semibold ${estado.cls}`}>
          {estado.txt}
        </span>
        {scale.tare > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-body text-[11px] font-semibold">
            Tara {fmtKgFixed(scale.tare)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {scale.tare > 0 ? (
          <button onClick={scale.clearTare}
            className="px-3 py-1.5 rounded-lg border border-border text-warm-gray hover:text-charcoal font-body text-xs font-semibold transition-colors">
            Quitar tara
          </button>
        ) : (
          <button onClick={scale.applyTare} disabled={!scale.live || scale.raw == null}
            title="Poner en cero con el envase sobre el plato"
            className="px-3 py-1.5 rounded-lg border border-border text-warm-gray hover:text-charcoal font-body text-xs font-semibold transition-colors disabled:opacity-40">
            Tara
          </button>
        )}
        <Link href="/admin/pos/balanza"
          className="px-3 py-1.5 rounded-lg border border-border text-warm-gray hover:text-charcoal font-body text-xs transition-colors">
          Diagnóstico
        </Link>
      </div>
    </div>
  )
}

/**
 * Modal de pesado con lectura en vivo.
 *
 * El peso de la balanza entra solo y se va actualizando mientras cambia el
 * plato: no hay que apretar nada para "tomarlo". Si el cajero escribe el peso
 * a mano, la pantalla deja de pisarlo hasta que él pida volver a la balanza.
 */
function WeighModal({
  product, scale, onCancel, onConfirm,
}: {
  product: Product
  scale: ScaleState
  onCancel: () => void
  onConfirm: (kg: number) => void
}) {
  const [input, setInput] = useState('')
  const [manual, setManual] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const auto = scale.connected && scale.live && !manual
  const liveKg = scale.weight

  // El peso de la balanza se copia solo al campo mientras nadie lo escriba a mano.
  useEffect(() => {
    if (!auto) return
    if (liveKg == null) return
    setInput(liveKg > EMPTY_KG ? liveKg.toFixed(3) : '')
  }, [auto, liveKg])

  const kg = parseNum(input)
  const valido = !isNaN(kg) && kg > 0
  // En automático esperamos a que el peso se asiente; a mano se confirma siempre.
  const puedeConfirmar = valido && (manual || !scale.connected || scale.stable)

  const confirmar = useCallback(() => {
    const v = parseNum(input)
    if (!v || v <= 0) return
    if (!(manual || !scale.connected || scale.stable)) return
    onConfirm(Math.round(v * 1000) / 1000)
  }, [input, manual, scale.connected, scale.stable, onConfirm])

  // Enter confirma y Esc cancela, esté donde esté el foco.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmar() }
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmar, onCancel])

  // Sin balanza, el foco arranca en el campo para tipear el peso directo.
  useEffect(() => {
    if (!scale.connected) inputRef.current?.focus()
  }, [scale.connected])

  // Con balanza, cuando el peso queda firme el foco pasa al botón: Enter cobra.
  useEffect(() => {
    if (auto && puedeConfirmar) confirmRef.current?.focus()
  }, [auto, puedeConfirmar])

  const estado = !scale.connected
    ? { txt: 'Balanza desconectada — escribí el peso', cls: 'text-warm-gray', box: 'bg-cream-dark border-border' }
    : manual
      ? { txt: 'Peso escrito a mano', cls: 'text-blue-700', box: 'bg-blue-50 border-blue-200' }
      : !scale.live
        ? { txt: 'Sin lectura de la balanza', cls: 'text-red-600', box: 'bg-red-50 border-red-200' }
        : !scale.hasLoad
          ? { txt: 'Poné el producto en el plato', cls: 'text-warm-gray', box: 'bg-cream-dark border-border' }
          : scale.stable
            ? { txt: 'Peso tomado de la balanza ✓', cls: 'text-green-700', box: 'bg-green-50 border-green-200' }
            : { txt: 'Estabilizando…', cls: 'text-amber-700', box: 'bg-amber-50 border-amber-200' }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><Scale size={18} /> Pesar</h2>
          <button onClick={onCancel} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <div className="font-body text-base font-semibold text-charcoal">{product.name}</div>
            <div className="font-body text-xs text-warm-gray">{fmtARS(product.price!)} / kg</div>
          </div>

          {/* Visor: el peso que se va a cargar */}
          <div className={`rounded-2xl border px-5 py-4 flex flex-col items-center gap-1 transition-colors ${estado.box}`}>
            <span className="font-num text-5xl font-bold text-charcoal leading-none">
              {valido ? kg.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '0,000'}
              <span className="text-2xl font-semibold text-warm-gray ml-1">kg</span>
            </span>
            <span className={`font-body text-xs font-semibold ${estado.cls}`}>{estado.txt}</span>
            {scale.tare > 0 && !manual && (
              <span className="font-body text-[11px] text-blue-700">Descontando tara de {fmtKgFixed(scale.tare)}</span>
            )}
          </div>

          {/* Corrección a mano */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="font-body text-xs text-warm-gray uppercase tracking-wide">
                {scale.connected ? 'Corregir a mano' : 'Peso en kg'}
              </label>
              {manual && scale.connected && (
                <button
                  onClick={() => { setManual(false); inputRef.current?.blur() }}
                  className="font-body text-xs text-burgundy font-semibold hover:underline">
                  Volver al peso de la balanza
                </button>
              )}
            </div>
            <input
              ref={inputRef}
              type="number" inputMode="decimal" min="0" step="0.001"
              value={input}
              onChange={e => { setManual(true); setInput(e.target.value) }}
              placeholder="Ej: 0.500"
              className="px-4 py-3 border border-border rounded-xl font-body text-lg focus:outline-none focus:border-burgundy"
            />
          </div>

          <div className="flex items-center justify-between bg-cream-dark rounded-xl px-4 py-3">
            <span className="font-body text-sm text-warm-gray">Subtotal</span>
            <span className="font-num text-2xl font-bold text-burgundy">
              {fmtARS((valido ? kg : 0) * product.price!)}
            </span>
          </div>

          <button
            ref={confirmRef}
            onClick={confirmar}
            disabled={!puedeConfirmar}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-burgundy text-cream rounded-xl font-body text-base font-bold hover:bg-burgundy-dark disabled:opacity-40 transition-colors">
            <Plus size={18} />
            {!valido ? 'Esperando peso…' : !puedeConfirmar ? 'Estabilizando…' : 'Agregar al carrito'}
            {puedeConfirmar && <span className="font-normal opacity-70 text-xs">(Enter)</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Cobro. Los medios que no son efectivo cierran la venta de una;
 * en efectivo se pide con cuánto paga y se muestra el vuelto en grande.
 */
function PayModal({
  total, onCancel, onCharge,
}: {
  total: number
  onCancel: () => void
  onCharge: (method: string, change: number | null) => void
}) {
  const [cashStep, setCashStep] = useState(false)
  const [paidWith, setPaidWith] = useState('')
  const cashRef = useRef<HTMLInputElement>(null)

  const paid = parseNum(paidWith)
  const paidOk = !isNaN(paid) && paid > 0
  const change = paidOk ? paid - total : 0
  const alcanza = paidOk && change >= -0.5

  // Billetes con los que suele pagar la gente, siempre por encima del total.
  const sugerencias = useMemo(() => {
    const set = new Set<number>()
    const up = (m: number) => Math.ceil(total / m) * m
    for (const m of [1000, 5000, 10000]) set.add(up(m))
    for (const n of [1000, 2000, 5000, 10000, 20000]) if (n > total) set.add(n)
    return [...set].filter(v => v > total).sort((a, b) => a - b).slice(0, 5)
  }, [total])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (cashStep) setCashStep(false)
        else onCancel()
      }
      if (e.key === 'Enter' && cashStep && alcanza) {
        e.preventDefault()
        onCharge('Efectivo', Math.max(0, Math.round(change)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cashStep, alcanza, change, onCancel, onCharge])

  useEffect(() => { if (cashStep) cashRef.current?.focus() }, [cashStep])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2">
            {cashStep && (
              <button onClick={() => setCashStep(false)} className="text-warm-gray hover:text-charcoal"><ArrowLeft size={18} /></button>
            )}
            Cobrar <span className="font-num">{fmtARS(total)}</span>
          </h2>
          <button onClick={onCancel} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>

        {!cashStep ? (
          <div className="p-5">
            <p className="font-body text-xs text-warm-gray uppercase tracking-wide mb-3">¿Cómo pagó?</p>
            <button
              autoFocus
              onClick={() => setCashStep(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-5 mb-3 rounded-xl bg-burgundy text-cream font-body text-lg font-bold hover:bg-burgundy-dark transition-colors">
              <Banknote size={22} /> Efectivo
            </button>
            <div className="grid grid-cols-2 gap-3">
              {PAYMENT_METHODS.filter(m => m !== 'Efectivo').map(m => (
                <button key={m} onClick={() => onCharge(m, null)}
                  className="px-4 py-4 rounded-xl border-2 border-burgundy/20 bg-white text-charcoal font-body text-base font-semibold hover:bg-burgundy hover:text-cream hover:border-burgundy transition-colors">
                  {m}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-body text-xs text-warm-gray uppercase tracking-wide">¿Con cuánto paga?</label>
              <input
                ref={cashRef}
                type="number" inputMode="decimal" min="0" step="any"
                value={paidWith}
                onChange={e => setPaidWith(e.target.value)}
                placeholder={String(Math.ceil(total))}
                className="px-4 py-3 border border-border rounded-xl font-num text-2xl font-bold focus:outline-none focus:border-burgundy"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPaidWith(String(Math.round(total)))}
                className="px-3 py-2 rounded-lg border border-border bg-white font-body text-sm font-semibold text-charcoal hover:border-burgundy hover:text-burgundy transition-colors">
                Justo
              </button>
              {sugerencias.map(v => (
                <button key={v} onClick={() => setPaidWith(String(v))}
                  className="px-3 py-2 rounded-lg border border-border bg-white font-num text-sm font-semibold text-charcoal hover:border-burgundy hover:text-burgundy transition-colors">
                  {fmtARS(v)}
                </button>
              ))}
            </div>

            <div className={`rounded-2xl px-5 py-4 flex items-center justify-between transition-colors ${
              !paidOk ? 'bg-cream-dark' : alcanza ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <span className="font-body text-sm text-warm-gray">Vuelto</span>
              <span className={`font-num text-4xl font-bold ${
                !paidOk ? 'text-warm-gray/40' : alcanza ? 'text-green-700' : 'text-red-600'
              }`}>
                {!paidOk ? '—' : alcanza ? fmtARS(Math.max(0, change)) : `Falta ${fmtARS(-change)}`}
              </span>
            </div>

            <button
              onClick={() => onCharge('Efectivo', paidOk ? Math.max(0, Math.round(change)) : null)}
              disabled={paidOk && !alcanza}
              className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-burgundy text-cream rounded-xl font-body text-base font-bold hover:bg-burgundy-dark disabled:opacity-40 transition-colors">
              <CircleDollarSign size={20} /> Cobrar en efectivo
              <span className="font-normal opacity-70 text-xs">(Enter)</span>
            </button>
            <p className="font-body text-[11px] text-warm-gray text-center">
              Podés cobrar sin cargar con cuánto paga: el vuelto es sólo una ayuda.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Importe suelto: para lo que no está en la lista (encargue, adicional, etc.). */
function FreeAmountModal({
  onCancel, onConfirm,
}: {
  onCancel: () => void
  onConfirm: (desc: string, amount: number) => void
}) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const value = parseNum(amount)
  const valido = !isNaN(value) && value > 0

  const confirmar = () => { if (valido) onConfirm(desc.trim(), Math.round(value * 100) / 100) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-sans text-lg font-bold text-charcoal flex items-center gap-2"><Banknote size={18} /> Monto libre</h2>
          <button onClick={onCancel} className="text-warm-gray hover:text-charcoal"><X size={20} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Importe</label>
            <input
              type="number" inputMode="decimal" min="0" step="any" autoFocus
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
              placeholder="0"
              className="px-4 py-3 border border-border rounded-xl font-num text-2xl font-bold focus:outline-none focus:border-burgundy"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-body text-xs text-warm-gray uppercase tracking-wide">Detalle (opcional)</label>
            <input
              type="text" value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmar() }}
              placeholder="Varios"
              className="px-4 py-3 border border-border rounded-xl font-body text-base focus:outline-none focus:border-burgundy"
            />
          </div>
          <button onClick={confirmar} disabled={!valido}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-burgundy text-cream rounded-xl font-body text-sm font-bold hover:bg-burgundy-dark disabled:opacity-40 transition-colors">
            <Plus size={16} /> Agregar al carrito
          </button>
          <p className="font-body text-[11px] text-warm-gray text-center">
            No descuenta stock: se registra como renglón suelto de la venta.
          </p>
        </div>
      </div>
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
  const countedNum = parseNum(counted) || 0
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
                <div className="font-num text-xl font-bold text-charcoal">{count}</div>
              </div>
              <div className="bg-cream-dark rounded-xl p-3">
                <div className="font-body text-xs text-warm-gray">Ticket promedio</div>
                <div className="font-num text-xl font-bold text-charcoal">{fmt(ticketAvg)}</div>
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
                  <span className="font-num text-sm font-semibold text-charcoal">{fmt(v)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2.5 bg-cream/50">
                <span className="font-body text-sm font-bold text-charcoal">Total vendido</span>
                <span className="font-num text-sm font-bold text-burgundy">{fmt(totalSales)}</span>
              </div>
            </div>

            <div className="bg-cream-dark rounded-xl p-4 flex flex-col gap-2">
              <div className="flex justify-between font-body text-sm text-warm-gray">
                <span>Fondo inicial</span><span className="font-num">{fmt(session.opening_float)}</span>
              </div>
              <div className="flex justify-between font-body text-sm text-warm-gray">
                <span>+ Ventas en efectivo</span><span className="font-num">{fmt(cashSales)}</span>
              </div>
              <div className="flex justify-between font-body text-sm font-semibold text-charcoal border-t border-border pt-2">
                <span>Efectivo esperado</span><span className="font-num">{fmt(expectedCash)}</span>
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
