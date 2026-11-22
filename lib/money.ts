/**
 * Precio de venta tal como lo define el administrador (por margen o manual),
 * redondeado al peso entero más cercano. No se fuerza a múltiplos de $100:
 * con un margen de 265,7% se puede llegar exactamente a $325.
 */
export function roundPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const valueInCents = Math.round(value * 100) / 100
  return Math.round(valueInCents)
}

/** Precio de venta según la receta: costo por unidad + margen, redondeado al peso. */
export function priceFromMarkup(perUnit: number, markupPct: number): number {
  return roundPrice(perUnit * (1 + markupPct / 100))
}

/**
 * Margen (con hasta dos decimales, como lo guarda la base) que lleva el costo
 * por unidad a un precio deseado. Prueba los centésimos vecinos para caer
 * exactamente en ese precio. Devuelve null si falta el costo o el precio.
 */
export function markupForPrice(perUnit: number, target: number): number | null {
  if (!(perUnit > 0) || !(target > 0)) return null
  const base = Math.round((target / perUnit - 1) * 10000) / 100
  const wanted = roundPrice(target)
  for (const step of [0, 0.01, -0.01, 0.02, -0.02, 0.03, -0.03]) {
    const markup = Math.round((base + step) * 100) / 100
    if (priceFromMarkup(perUnit, markup) === wanted) return markup
  }
  return base
}

/** Redondea importes hacia arriba al múltiplo de $100 más próximo. */
export function roundUpTo100(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const valueInCents = Math.round(value * 100) / 100
  return Math.ceil(valueInCents / 100) * 100
}

/**
 * Importe de un renglón de venta.
 * - Productos por peso (kg): kilos × precio con redondeo comercial hacia
 *   arriba a $100, porque la balanza da importes con monedas sueltas.
 * - Unidades y presentaciones: cantidad × precio, exacto al peso. Así un
 *   producto de $325 se cobra $325 y dos se cobran $650.
 */
export function lineSubtotal(quantity: number, unitPrice: number, unit: string): number {
  const amount = quantity * unitPrice
  return unit === 'kg' ? roundUpTo100(amount) : roundPrice(amount)
}
