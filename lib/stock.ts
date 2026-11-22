/** Utilidades compartidas por las pantallas de stock. */

/** Fecha local (AAAA-MM-DD) para inputs de tipo date. */
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Inicio del día local indicado y del día siguiente, como instantes ISO. */
export function dayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

export const fmtStockQty = (value: number) =>
  value.toLocaleString('es-AR', { maximumFractionDigits: 3 })

export const fmtTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

/** Nombre legible de un movimiento de stock según su motivo y origen. */
export function movementLabel(reason: string, refType: string | null): string {
  if (refType === 'existencia_final_manual') return 'Conteo (existencia final)'
  switch (reason) {
    case 'venta': return 'Venta'
    case 'consumo_interno': return 'Consumo interno'
    case 'correccion_venta': return 'Corrección de venta'
    case 'anulacion': return 'Anulación de venta'
    case 'merma': return 'Merma / descarte'
    case 'ajuste': return 'Ajuste puntual'
    case 'produccion': return 'Producción'
    case 'compra': return 'Compra'
    default: return reason
  }
}
