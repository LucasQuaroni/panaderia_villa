/** Redondea importes hacia arriba al múltiplo de $100 más próximo. */
export function roundUpTo100(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const valueInCents = Math.round(value * 100) / 100
  return Math.ceil(valueInCents / 100) * 100
}
