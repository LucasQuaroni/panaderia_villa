/**
 * Integración con la balanza SYSTEL Clipse por puerto serie (Web Serial API).
 *
 * ── Cómo habla la balanza ────────────────────────────────────────────────────
 * La Clipse NO transmite el peso sola: funciona por pregunta/respuesta. La PC
 * manda un byte de pedido y la balanza contesta una trama con el peso.
 *
 *   Systel nativo : PC envía ENQ (0x05)
 *                   → balanza responde STX + peso ASCII + ETX + XOR
 *                   → si el peso está inestable responde DC1 (0x11) y no manda peso
 *   Modo Torrey   : PC envía 'P' → balanza responde CR + peso ASCII
 *   Modo CAS      : PC envía 'W' → balanza responde STX + peso ASCII + CR
 *
 * Como el modo activo depende de cómo esté configurada la unidad, este módulo
 * arranca en autodetección: rota entre los cuatro protocolos hasta que uno
 * devuelve un peso válido, y a partir de ahí se queda con ese.
 *
 * ── Cableado / entorno ───────────────────────────────────────────────────────
 * Puerto: 9600 baudios, 8 datos, sin paridad, 1 stop (9600 8N1).
 * Conector de la balanza: DE-9 (DB9) hembra. Necesita cruce null-modem
 * (2↔3, 3↔2, 5↔5) contra el adaptador USB–serie.
 * Navegador: Chrome o Edge de escritorio, sobre HTTPS o localhost.
 * En Windows conviene un adaptador con chipset FTDI: los Prolific PL2303
 * clonados no levantan driver y Web Serial no llega a ver el puerto.
 *
 * Para diagnosticar en el negocio: /admin/pos/balanza muestra la trama cruda.
 */

// ── Bytes del protocolo ──────────────────────────────────────────────────────
const ENQ = 0x05 // pedido de peso (Systel nativo)
const STX = 0x02 // inicio de trama
const ETX = 0x03 // fin de trama
const DC1 = 0x11 // "peso inestable", la balanza rechaza el pedido
const CR = 0x0d
const LF = 0x0a

/** Máximo de la Clipse según la etiqueta (Máx 31 kg). */
export const MAX_KG = 31

export type ScaleProtocol = 'systel' | 'torrey' | 'cas' | 'continuous'

/** Orden de prueba durante la autodetección. */
const PROTOCOL_ORDER: ScaleProtocol[] = ['systel', 'torrey', 'cas', 'continuous']

/** Byte que hay que mandar para pedir el peso en cada protocolo. */
const REQUEST: Record<ScaleProtocol, Uint8Array | null> = {
  systel: new Uint8Array([ENQ]),
  torrey: new Uint8Array([0x50]), // 'P'
  cas: new Uint8Array([0x57]), // 'W'
  continuous: null, // la balanza transmite sola, no se le pide nada
}

// ── Tipos mínimos de Web Serial (no vienen en la lib estándar) ───────────────
interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(): Promise<SerialPortLike>
}

function getSerial(): SerialLike | null {
  if (typeof navigator === 'undefined') return null
  const s = (navigator as unknown as { serial?: SerialLike }).serial
  return s ?? null
}

export function isScaleSupported(): boolean {
  return getSerial() !== null
}

// ── Parseo ───────────────────────────────────────────────────────────────────

/**
 * Convierte el texto de peso de una trama a kg.
 * Tolera coma o punto decimal y descarta valores fuera del rango de la balanza.
 * Si viene sin separador decimal y el número es grande, asume gramos.
 */
export function parseWeight(text: string): number | null {
  // Buscamos los números presentes en vez de limpiar el texto: muchas balanzas
  // anteponen etiquetas de estado ("ST,GS,") y la unidad al final ("kg"), y
  // esas comas no son separadores decimales.
  const matches = text.match(/[-+]?\d+(?:[.,]\d+)?/g)
  if (!matches) return null

  // De atrás para adelante: el peso suele ser el último número de la trama.
  for (let i = matches.length - 1; i >= 0; i--) {
    const token = matches[i]
    const hasDecimalSep = /[.,]/.test(token)
    let val = parseFloat(token.replace(',', '.'))
    if (isNaN(val)) continue

    // Algunas configuraciones transmiten el peso en gramos, sin punto decimal.
    if (!hasDecimalSep && Math.abs(val) > MAX_KG) val = val / 1000

    if (Math.abs(val) <= MAX_KG) return val
  }
  return null
}

export interface ScaleFrame {
  /** Peso en kg, o null si la trama no traía un peso legible. */
  kg: number | null
  /** true si la balanza avisó que el peso todavía no se estabilizó. */
  unstable: boolean
  /** Representación legible de los bytes recibidos (para diagnóstico). */
  raw: string
}

/** Vuelca los bytes recibidos a texto legible: imprimibles tal cual, el resto en <HEX>. */
function toReadable(bytes: number[]): string {
  return bytes
    .map(b => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : `<${b.toString(16).padStart(2, '0').toUpperCase()}>`))
    .join('')
}

/**
 * Extrae todas las tramas completas que haya en el buffer.
 * Devuelve las tramas encontradas y lo que quede sin consumir (trama a medias).
 */
export function drainFrames(buf: number[], proto: ScaleProtocol): { frames: ScaleFrame[]; rest: number[] } {
  const frames: ScaleFrame[] = []
  let i = 0

  // Protocolo Systel nativo: STX ... ETX + byte de verificación XOR.
  if (proto === 'systel') {
    while (i < buf.length) {
      const b = buf[i]

      if (b === DC1) {
        frames.push({ kg: null, unstable: true, raw: '<11>' })
        i++
        continue
      }

      if (b !== STX) {
        i++ // ruido antes del inicio de trama: se descarta
        continue
      }

      const etx = buf.indexOf(ETX, i + 1)
      if (etx === -1) break // trama incompleta: esperamos más bytes

      // Después del ETX viene 1 byte de XOR; si todavía no llegó, esperamos.
      if (etx + 1 >= buf.length) break

      const payload = buf.slice(i + 1, etx)
      frames.push({
        kg: parseWeight(String.fromCharCode(...payload)),
        unstable: false,
        raw: toReadable(buf.slice(i, etx + 2)),
      })
      i = etx + 2
    }
    return { frames, rest: buf.slice(i) }
  }

  // Torrey / CAS / transmisión continua: tramas terminadas en CR o LF.
  while (i < buf.length) {
    const cr = buf.indexOf(CR, i)
    const lf = buf.indexOf(LF, i)
    const end = cr === -1 ? lf : lf === -1 ? cr : Math.min(cr, lf)
    if (end === -1) break

    const line = buf.slice(i, end)
    if (line.length > 0) {
      frames.push({
        kg: parseWeight(String.fromCharCode(...line)),
        unstable: false,
        raw: toReadable(line),
      })
    }
    i = end + 1
  }

  // Sin terminador a la vista y el buffer creciendo: cortamos para no acumular.
  const rest = buf.slice(i)
  return { frames, rest: rest.length > 512 ? rest.slice(-512) : rest }
}

// ── Controlador ──────────────────────────────────────────────────────────────

export interface ScaleController {
  stop: () => Promise<void>
  /** Protocolo en uso (o null mientras autodetecta). */
  protocol: () => ScaleProtocol | null
}

export interface StartOptions {
  /** Peso estable leído de la balanza, en kg. */
  onWeight: (kg: number) => void
  /** Cambio de estado de la conexión. */
  onStatus: (connected: boolean) => void
  /** true mientras la balanza reporta que el peso no se estabilizó. */
  onStable?: (stable: boolean) => void
  /** Trama cruda, para la pantalla de diagnóstico. */
  onRaw?: (raw: string) => void
  /** Protocolo detectado / confirmado. */
  onProtocol?: (proto: ScaleProtocol) => void
  /** true: reconecta a un puerto ya autorizado sin abrir el diálogo del navegador. */
  reusePort?: boolean
  /** Fuerza un protocolo en vez de autodetectar. */
  protocol?: ScaleProtocol
  /** Cada cuánto se le pide el peso a la balanza (ms). */
  pollMs?: number
}

/**
 * Abre la balanza y empieza a pedir el peso periódicamente.
 * Devuelve un controlador para frenar la lectura, o null si no se pudo abrir.
 */
export async function startScale(opts: StartOptions): Promise<ScaleController | null> {
  const serial = getSerial()
  if (!serial) return null

  const pollMs = opts.pollMs ?? 250

  let port: SerialPortLike | null = null
  try {
    if (opts.reusePort) {
      const ports = await serial.getPorts()
      port = ports[0] ?? null
      if (!port) return null // sin puerto autorizado previamente: no molestamos al usuario
    } else {
      port = await serial.requestPort()
    }
    await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' })
  } catch {
    return null
  }

  opts.onStatus(true)

  let active = true
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null

  // Autodetección: si viene un protocolo forzado, arrancamos ya confirmados.
  let protoIndex = opts.protocol ? PROTOCOL_ORDER.indexOf(opts.protocol) : 0
  if (protoIndex < 0) protoIndex = 0
  let locked = Boolean(opts.protocol)
  let attemptsOnProto = 0
  let buffer: number[] = []

  const currentProto = () => PROTOCOL_ORDER[protoIndex]

  if (locked) opts.onProtocol?.(currentProto())

  // ── Lectura: un único loop que acumula bytes y extrae tramas ──
  const readLoop = async () => {
    while (active && port && port.readable) {
      try {
        reader = port.readable.getReader()
        while (active) {
          const { value, done } = await reader.read()
          if (done) break
          if (!value || value.length === 0) continue

          buffer.push(...value)
          const { frames, rest } = drainFrames(buffer, currentProto())
          buffer = rest

          for (const f of frames) {
            if (f.raw) opts.onRaw?.(f.raw)

            if (f.unstable) {
              opts.onStable?.(false)
              // Una respuesta de "inestable" igual confirma que el protocolo es el correcto.
              if (!locked) {
                locked = true
                opts.onProtocol?.(currentProto())
              }
              continue
            }

            if (f.kg !== null) {
              if (!locked) {
                locked = true
                opts.onProtocol?.(currentProto())
              }
              opts.onStable?.(true)
              opts.onWeight(f.kg)
            }
          }
        }
      } catch {
        break
      } finally {
        try { reader?.releaseLock() } catch { /* noop */ }
        reader = null
      }
    }
  }

  // ── Escritura: le pedimos el peso a la balanza cada pollMs ──
  const pollLoop = async () => {
    try {
      if (!port?.writable) return
      writer = port.writable.getWriter()
    } catch {
      return
    }

    while (active) {
      const proto = currentProto()
      const cmd = REQUEST[proto]

      if (cmd && writer) {
        try {
          await writer.write(cmd)
        } catch {
          break // el puerto se cerró o se desconectó el cable
        }
      }

      // Todavía sin respuesta válida: después de unos intentos probamos el
      // siguiente protocolo. En 'continuous' no hay nada que mandar, así que
      // le damos margen para ver si la balanza transmite sola.
      if (!locked) {
        attemptsOnProto++
        const limit = proto === 'continuous' ? 12 : 8
        if (attemptsOnProto >= limit) {
          attemptsOnProto = 0
          protoIndex = (protoIndex + 1) % PROTOCOL_ORDER.length
          buffer = [] // el buffer viejo es de otro protocolo, no sirve
        }
      }

      await new Promise(r => setTimeout(r, pollMs))
    }

    try { writer?.releaseLock() } catch { /* noop */ }
    writer = null
  }

  readLoop()
  pollLoop()

  return {
    protocol: () => (locked ? currentProto() : null),
    stop: async () => {
      active = false
      try { await reader?.cancel() } catch { /* noop */ }
      try { writer?.releaseLock() } catch { /* noop */ }
      // Le damos un instante al pollLoop para que salga antes de cerrar el puerto.
      await new Promise(r => setTimeout(r, 50))
      try { await port?.close() } catch { /* noop */ }
      opts.onStatus(false)
    },
  }
}
