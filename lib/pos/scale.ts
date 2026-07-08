/**
 * Integración con la balanza SYSTEL Clipse por puerto serie (Web Serial API).
 *
 * Funciona en Chrome/Edge sobre HTTPS (o localhost). La balanza se conecta con
 * un adaptador USB–serie (DB9). Configuración: 9600 baudios, 8 datos, sin
 * paridad, 1 bit de parada (9600 8N1).
 *
 * "Plug and play": una vez que autorizás el puerto la primera vez, en las
 * siguientes aperturas se reconecta solo (getPorts()).
 *
 * NOTA sobre el parseo: la Clipse transmite el peso en texto (ASCII). El
 * extractor de abajo toma el número con decimales dentro del rango de la
 * balanza (0–31 kg). Si tu unidad usa un formato particular, se ajusta en
 * `parseWeight` — el resto de la plomería ya queda hecho.
 */

// ── Tipos mínimos de Web Serial (no vienen en la lib estándar) ──
interface SerialPortLike {
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>
  close(): Promise<void>
  readable: ReadableStream<Uint8Array> | null
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

/** Extrae el peso en kg de un fragmento de texto de la balanza. */
export function parseWeight(text: string): number | null {
  // Busca números con decimales (ej: 0.500, 1,250) y toma uno plausible (0–31 kg).
  const matches = text.match(/\d{1,2}[.,]\d{1,3}/g)
  if (!matches) return null
  for (let i = matches.length - 1; i >= 0; i--) {
    const val = parseFloat(matches[i].replace(',', '.'))
    if (!isNaN(val) && val >= 0 && val <= 31) return val
  }
  return null
}

export interface ScaleController {
  stop: () => Promise<void>
}

interface StartOptions {
  onWeight: (kg: number) => void
  onStatus: (connected: boolean) => void
  reusePort?: boolean // true: intenta reconectar sin pedir permiso (autoconexión)
}

/**
 * Abre la balanza y empieza a leer el peso en vivo.
 * Devuelve un controlador para frenar la lectura, o null si no se pudo.
 */
export async function startScale(opts: StartOptions): Promise<ScaleController | null> {
  const serial = getSerial()
  if (!serial) return null

  let port: SerialPortLike | null = null
  try {
    if (opts.reusePort) {
      const ports = await serial.getPorts()
      port = ports[0] ?? null
      if (!port) return null // no hay puerto ya autorizado: no molestamos al usuario
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
  const decoder = new TextDecoder()
  let buffer = ''

  const readLoop = async () => {
    while (active && port && port.readable) {
      try {
        reader = port.readable.getReader()
        while (active) {
          const { value, done } = await reader.read()
          if (done) break
          if (value) {
            buffer += decoder.decode(value, { stream: true })
            if (buffer.length > 256) buffer = buffer.slice(-256) // no dejar crecer
            const kg = parseWeight(buffer)
            if (kg !== null) opts.onWeight(kg)
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
  readLoop()

  return {
    stop: async () => {
      active = false
      try { await reader?.cancel() } catch { /* noop */ }
      try { await port?.close() } catch { /* noop */ }
      opts.onStatus(false)
    },
  }
}
