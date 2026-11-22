/**
 * Tests de precios: margen con decimales, precio exacto y cobro por renglón.
 *
 * Correr con:  npm run test:precios
 *
 * Caso real: con costo por unidad de $88,87 y margen 265,7% el precio tiene
 * que dar $325, no $400 (antes se redondeaba hacia arriba a múltiplos de $100).
 */

import { lineSubtotal, markupForPrice, priceFromMarkup, roundPrice, roundUpTo100 } from '../lib/money.ts'

let pass = 0
let fail = 0

function t(nombre: string, obtuvo: unknown, esperado: unknown) {
  const g = JSON.stringify(obtuvo)
  const e = JSON.stringify(esperado)
  if (g === e) {
    pass++
    console.log('  ok   ' + nombre)
  } else {
    fail++
    console.log(`  FALLA ${nombre}\n        esperado ${e}\n        obtuvo   ${g}`)
  }
}

console.log('Precio por margen')
t('265,7% sobre $88,87 da $325', priceFromMarkup(88.87, 265.7), 325)
t('300% sobre $50 da $200', priceFromMarkup(50, 300), 200)
t('300% sobre $55 da $220 (no salta a $300)', priceFromMarkup(55, 300), 220)
t('si sube el costo, sube el precio', priceFromMarkup(60, 300) > priceFromMarkup(55, 300), true)
t('se redondea al peso, sin centavos', priceFromMarkup(10.01, 250), 35)
t('margen 0 deja el costo', priceFromMarkup(120, 0), 120)

console.log('Margen para llegar a un precio')
t('$325 con costo $88,87 → 265,7%', markupForPrice(88.87, 325), 265.7)
for (const [cost, target] of [[88.87, 325], [123.45, 500], [731.2, 2650], [3.33, 25], [15999.99, 48000], [42, 42]]) {
  const markup = markupForPrice(cost, target)
  t(`costo $${cost} → precio $${target} exacto`, markup !== null && priceFromMarkup(cost, markup), target)
}
t('sin costo no hay margen', markupForPrice(0, 325), null)
t('sin precio no hay margen', markupForPrice(88.87, 0), null)
t('precio menor al costo da margen negativo', (markupForPrice(100, 80) ?? 0) < 0, true)

console.log('Redondeo de precios')
t('roundPrice respeta $325', roundPrice(325), 325)
t('roundPrice $324,6 → $325', roundPrice(324.6), 325)
t('roundPrice $324,4 → $324', roundPrice(324.4), 324)
t('roundPrice de valores inválidos es 0', [roundPrice(-5), roundPrice(Number.NaN), roundPrice(0)], [0, 0, 0])
t('roundUpTo100 sigue disponible para la balanza', roundUpTo100(1420.25), 1500)

console.log('Importe por renglón')
t('1 unidad de $325 cobra $325', lineSubtotal(1, 325, 'unidad'), 325)
t('2 unidades de $325 cobran $650', lineSubtotal(2, 325, 'unidad'), 650)
t('presentación "Media docena" × 3 exacta', lineSubtotal(3, 1950, 'Media docena'), 5850)
t('por kilo mantiene el redondeo comercial a $100', lineSubtotal(0.437, 3250, 'kg'), 1500)
t('1 kg justo de $3250 cobra $3300 (redondeo de balanza)', lineSubtotal(1, 3250, 'kg'), 3300)
t('cantidad 0 cobra 0', lineSubtotal(0, 325, 'unidad'), 0)

console.log(`\n${pass} ok, ${fail} con falla`)
if (fail > 0) process.exit(1)
