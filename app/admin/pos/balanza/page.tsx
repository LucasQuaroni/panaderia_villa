'use client'

/**
 * Diagnóstico de la balanza SYSTEL Clipse.
 *
 * Pantalla de servicio para usar el día que se conecta el cable: muestra el
 * protocolo detectado, el peso en vivo y las tramas crudas tal como llegan.
 * Si el peso no aparece, acá se ve exactamente en qué punto se corta.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Scale, Cable, ArrowLeft, Trash2, Copy, Check } from 'lucide-react'
import {
  startScale, isScaleSupported,
  type ScaleController, type ScaleProtocol,
} from '@/lib/pos/scale'

const PROTOCOLOS: { id: ScaleProtocol | 'auto'; label: string; detalle: string }[] = [
  { id: 'auto', label: 'Autodetectar', detalle: 'Prueba los cuatro modos hasta que uno responda' },
  { id: 'systel', label: 'Systel nativo', detalle: 'PC envía ENQ (0x05) → STX + peso + ETX + XOR' },
  { id: 'torrey', label: 'Torrey', detalle: "PC envía 'P' → CR + peso" },
  { id: 'cas', label: 'CAS', detalle: "PC envía 'W' → STX + peso + CR" },
  { id: 'continuous', label: 'Continuo', detalle: 'La balanza transmite sola, sin pedido' },
]

const MAX_LOG = 200

export default function DiagnosticoBalanzaPage() {
  const [supported, setSupported] = useState(true)
  const [connected, setConnected] = useState(false)
  const [weight, setWeight] = useState<number | null>(null)
  const [stable, setStable] = useState(true)
  const [detected, setDetected] = useState<ScaleProtocol | null>(null)
  const [forced, setForced] = useState<ScaleProtocol | 'auto'>('auto')
  const [log, setLog] = useState<{ t: string; raw: string }[]>([])
  const [copied, setCopied] = useState(false)

  const ctrlRef = useRef<ScaleController | null>(null)

  useEffect(() => {
    setSupported(isScaleSupported())
    return () => { ctrlRef.current?.stop(); ctrlRef.current = null }
  }, [])

  const conectar = useCallback(async (reuse: boolean) => {
    await ctrlRef.current?.stop()
    ctrlRef.current = null
    setDetected(null)
    setWeight(null)

    const ctrl = await startScale({
      reusePort: reuse,
      protocol: forced === 'auto' ? undefined : forced,
      onWeight: setWeight,
      onStatus: setConnected,
      onStable: setStable,
      onProtocol: setDetected,
      onRaw: (raw) => {
        const t = new Date().toLocaleTimeString('es-AR', { hour12: false })
        setLog(prev => [{ t, raw }, ...prev].slice(0, MAX_LOG))
      },
    })
    ctrlRef.current = ctrl
    if (!ctrl && !reuse) {
      setLog(prev => [{ t: '—', raw: 'No se pudo abrir el puerto. ¿Elegiste el adaptador USB–serie en el diálogo?' }, ...prev])
    }
  }, [forced])

  const desconectar = useCallback(async () => {
    await ctrlRef.current?.stop()
    ctrlRef.current = null
    setDetected(null)
    setWeight(null)
  }, [])

  const copiarLog = async () => {
    const texto = log.map(l => `${l.t}  ${l.raw}`).join('\n')
    try {
      await navigator.clipboard.writeText(texto)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* el portapapeles puede estar bloqueado */ }
  }

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <Link href="/admin/pos" className="text-warm-gray hover:text-charcoal"><ArrowLeft size={20} /></Link>
          <h1 className="font-sans text-2xl font-bold text-charcoal flex items-center gap-2">
            <Scale size={22} /> Diagnóstico de balanza
          </h1>
        </div>

        {!supported && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 font-body text-sm text-amber-900">
            Este navegador no soporta Web Serial. Usá <b>Chrome</b> o <b>Edge</b> de escritorio,
            sobre HTTPS o localhost. No funciona en Safari, Firefox ni en el celular.
          </div>
        )}

        {/* Estado */}
        <div className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Dato titulo="Conexión" valor={connected ? 'Abierta' : 'Cerrada'} ok={connected} />
            <Dato
              titulo="Protocolo"
              valor={detected ? PROTOCOLOS.find(p => p.id === detected)?.label ?? detected : connected ? 'Detectando…' : '—'}
              ok={Boolean(detected)}
            />
            <Dato
              titulo="Peso"
              valor={weight != null ? `${weight.toLocaleString('es-AR', { maximumFractionDigits: 3 })} kg` : '—'}
              ok={weight != null && stable}
            />
          </div>

          {connected && !stable && (
            <div className="font-body text-xs text-amber-700">
              La balanza reporta peso inestable (DC1). Esperá a que se asiente el plato.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={forced}
              onChange={e => setForced(e.target.value as ScaleProtocol | 'auto')}
              disabled={connected}
              className="px-3 py-2 border border-border rounded-xl font-body text-sm bg-white disabled:opacity-50"
            >
              {PROTOCOLOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>

            {connected ? (
              <button onClick={desconectar}
                className="px-4 py-2 rounded-xl border border-border text-charcoal font-body text-sm font-semibold hover:bg-cream transition-colors">
                Desconectar
              </button>
            ) : (
              <button onClick={() => conectar(false)} disabled={!supported}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-burgundy text-cream font-body text-sm font-bold hover:bg-burgundy-dark transition-colors disabled:opacity-40">
                <Cable size={16} /> Conectar balanza
              </button>
            )}
          </div>

          <p className="font-body text-xs text-warm-gray">
            {PROTOCOLOS.find(p => p.id === forced)?.detalle}
          </p>
        </div>

        {/* Tramas crudas */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-sans text-sm font-bold text-charcoal">Tramas recibidas</h2>
            <div className="flex items-center gap-2">
              <button onClick={copiarLog} disabled={log.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border font-body text-xs text-warm-gray hover:text-charcoal transition-colors disabled:opacity-40">
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button onClick={() => setLog([])} disabled={log.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border font-body text-xs text-warm-gray hover:text-charcoal transition-colors disabled:opacity-40">
                <Trash2 size={13} /> Limpiar
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {log.length === 0 ? (
              <p className="p-5 font-body text-sm text-warm-gray">
                Todavía no llegó nada. Si después de conectar el log queda vacío, el problema es
                el cable: casi seguro falta el cruce null-modem (2↔3, 3↔2, 5↔5).
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {log.map((l, i) => (
                  <li key={i} className="px-5 py-2 flex gap-4 font-mono text-xs">
                    <span className="text-warm-gray shrink-0">{l.t}</span>
                    <span className="text-charcoal break-all">{l.raw}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ayuda */}
        <details className="bg-white rounded-2xl border border-border p-5">
          <summary className="font-sans text-sm font-bold text-charcoal cursor-pointer">
            Si no lee: por dónde empezar
          </summary>
          <ol className="mt-4 flex flex-col gap-2 font-body text-sm text-warm-gray list-decimal pl-5">
            <li><b>El diálogo no muestra ningún puerto:</b> Windows no reconoce el adaptador. Abrí el Administrador de dispositivos y buscá &quot;Puertos (COM y LPT)&quot;. Si aparece con un triángulo amarillo, es un Prolific PL2303 clonado — hay que cambiarlo por uno con chipset FTDI.</li>
            <li><b>Conecta pero no llega ninguna trama:</b> falta el cruce null-modem. La balanza y la PC son las dos DTE (pin 2 = RXD, pin 3 = TXD en ambas), así que hay que cruzar 2 y 3.</li>
            <li><b>Llegan tramas pero el peso sale mal:</b> copiá el log y ajustamos el parseo a la trama exacta de esta unidad.</li>
            <li><b>Llegan caracteres raros (&lt;FF&gt;, &lt;00&gt;):</b> la velocidad no coincide. La Clipse debería estar en 9600 8N1; revisalo en el menú de la balanza.</li>
            <li><b>El puerto abre una sola vez:</b> cerrá cualquier otro programa que esté usando el COM (software viejo de balanza, PuTTY, monitor serie).</li>
          </ol>
        </details>

      </div>
    </div>
  )
}

function Dato({ titulo, valor, ok }: { titulo: string; valor: string; ok: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-xs text-warm-gray uppercase tracking-wide">{titulo}</span>
      <span className={`font-num text-lg font-bold ${ok ? 'text-green-700' : 'text-charcoal'}`}>{valor}</span>
    </div>
  )
}
