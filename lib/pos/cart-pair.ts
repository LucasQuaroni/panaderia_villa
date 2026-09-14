export type CartIndex = 0 | 1
export type CartPair<T> = [T, T]

/**
 * Actualiza un carrito concreto sin depender de cuál esté seleccionado al
 * momento de terminar una operación asíncrona (por ejemplo, un pesaje).
 */
export function updateCartAt<T>(
  carts: CartPair<T>,
  index: CartIndex,
  updater: (cart: T) => T,
): CartPair<T> {
  if (index === 0) return [updater(carts[0]), carts[1]]
  return [carts[0], updater(carts[1])]
}
