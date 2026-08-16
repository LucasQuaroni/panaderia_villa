'use client'

/**
 * Estado en vivo de la balanza para el mostrador.
 *
 * Encapsula todo lo que la pantalla necesita saber del plato:
 *   · peso bruto y neto (con tara por software)
 *   · si la lectura está estable (para poder tomarla sin apretar nada)
 *   · si siguen llegando tramas (por si alguien patea el cable)
 *
 * ── Por qué hay estabilidad "por software" ──────────────────────────────────
 * Sólo el protocolo Systel nativo avisa explícitamente cuando el peso todavía
 * se mueve (responde DC1). En Torrey / CAS / continuo la balanza manda el peso
 * igual mientras oscila, así que acá miramos las últimas lecturas: si el valor
 * no se movió más que STABLE_TOLERANCE_KG durante STABLE_MS, lo damos por firme.
 * Recién ahí el mostrador lo toma solo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  startScale, isScaleSupported,
  type ScaleController, type ScaleProtocol,
} from '@/lib/pos/scale'

/** Variación máxima entre lecturas para considerarlas la misma (3 g). */
const STABLE_TOLERANCE_KG = 0.003
/** Cuánto tiene que quedarse quieto el peso para darlo por estable. */
const STABLE_MS = 450
/** Sin tramas por más de esto, la lectura se considera vencida. */
const STALE_MS = 2500
/** Por debajo de esto consideramos el plato vacío (5 g). */
export const EMPTY_KG = 0.005

export interface ScaleState {
  /** El navegador soporta Web Serial (Chrome/Edge de escritorio). */
  supported: boolean
  /** El puerto está abierto. */
  connected: boolean
  /** Protocolo detectado, o null mientras autodetecta. */
  protocol: ScaleProtocol | null
  /** Llegan tramas ahora mismo (si se corta el cable pasa a false). */
  live: boolean
  /** Lo que marca el plato, sin descontar la tara. */
  raw: number | null
  /** Peso neto = bruto − tara. Es el que se usa para vender. */
  weight: number | null
  /** El peso dejó de moverse: se puede tomar. */
  stable: boolean
  /** Hay algo en el plato (por encima del umbral de ruido). */
  hasLoad: boolean
  /** Tara activa en kg (0 = sin tara). */
  tare: number
  connect: (reuse?: boolean) => Promise<boolean>
  disconnect: () => Promise<void>
  /** Pone a cero el peso actual (tara del envase). */
  applyTare: () => void
  clearTare: () => void
}

export function useScale(): ScaleState {
  const [supported, setSupported] = useState(false)
  const [connected, setConnected] = useState(false)
  const [protocol, setProtocol] = useState<ScaleProtocol | null>(null)
  const [raw, setRaw] = useState<number | null>(null)
  const [stable, setStable] = useState(false)
  const [live, setLive] = useState(false)
  const [tare, setTare] = useState(0)

  const ctrlRef = useRef<ScaleController | null>(null)
  const connectingRef = useRef(false)

  // Refs para el cálculo de estabilidad (no queremos re-render por cada trama).
  const lastValueRef = useRef<number | null>(null)
  const steadySinceRef = useRef<number>(0)
  const lastFrameAtRef = useRef<number>(0)
  const hwStableRef = useRef(true)
  const rawRef = useRef<number | null>(null)

  const resetReadings = useCallback(() => {
    lastValueRef.current = null
    steadySinceRef.current = 0
    lastFrameAtRef.current = 0
    hwStableRef.current = true
    rawRef.current = null
    setRaw(null)
    setStable(false)
    setLive(false)
  }, [])

  const connect = useCallback(async (reuse = false) => {
    if (ctrlRef.current || connectingRef.current) return true
    connectingRef.current = true
    try {
      const ctrl = await startScale({
        reusePort: reuse,
        onWeight: (kg) => {
          const now = Date.now()
          lastFrameAtRef.current = now
          setLive(true)

          const prev = lastValueRef.current
          if (prev === null || Math.abs(kg - prev) > STABLE_TOLERANCE_KG) {
            // Se movió: arranca de nuevo el conteo de quietud.
            lastValueRef.current = kg
            steadySinceRef.current = now
            setStable(false)
          } else if (hwStableRef.current && now - steadySinceRef.current >= STABLE_MS) {
            setStable(true)
          }

          rawRef.current = kg
          setRaw(kg)
        },
        onStatus: (c) => {
          setConnected(c)
          if (!c) {
            ctrlRef.current = null
            resetReadings()
            setProtocol(null)
          }
        },
        onStable: (st) => {
          hwStableRef.current = st
          // La balanza avisa que el peso todavía se mueve: no lo tomamos.
          if (!st) {
            setStable(false)
            steadySinceRef.current = Date.now()
            lastFrameAtRef.current = Date.now()
            setLive(true)
          }
        },
        onProtocol: setProtocol,
      })
      ctrlRef.current = ctrl
      return ctrl !== null
    } finally {
      connectingRef.current = false
    }
  }, [resetReadings])

  const disconnect = useCallback(async () => {
    const ctrl = ctrlRef.current
    ctrlRef.current = null
    await ctrl?.stop()
    resetReadings()
    setProtocol(null)
  }, [resetReadings])

  // Soporte + autoconexión silenciosa si el puerto ya fue autorizado antes.
  useEffect(() => {
    const ok = isScaleSupported()
    setSupported(ok)
    if (ok) connect(true)
    return () => { ctrlRef.current?.stop(); ctrlRef.current = null }
  }, [connect])

  // Si vuelven a enchufar el adaptador USB, reconectamos solos.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const serial = (navigator as unknown as { serial?: EventTarget }).serial
    if (!serial) return
    const onPlug = () => { if (!ctrlRef.current) connect(true) }
    serial.addEventListener('connect', onPlug)
    return () => serial.removeEventListener('connect', onPlug)
  }, [connect])

  // Vigilancia: si dejan de llegar tramas, la lectura vence (no mostramos
  // un peso viejo como si fuera el actual).
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => {
      if (lastFrameAtRef.current && Date.now() - lastFrameAtRef.current > STALE_MS) {
        setLive(false)
        setStable(false)
      }
    }, 800)
    return () => clearInterval(id)
  }, [connected])

  const applyTare = useCallback(() => {
    if (rawRef.current != null) setTare(rawRef.current)
  }, [])
  const clearTare = useCallback(() => setTare(0), [])

  const weight = raw != null ? Math.round((raw - tare) * 1000) / 1000 : null
  const hasLoad = weight != null && weight > EMPTY_KG

  return {
    supported, connected, protocol, live, raw, weight,
    stable: stable && live, hasLoad, tare,
    connect, disconnect, applyTare, clearTare,
  }
}
