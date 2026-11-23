/**
 * Tests de Movimientos del cliente mayorista.
 *
 * Correr con:  npm run test:mayorista
 *
 * Caso real (23/11/2026): las compras pagadas al contado no aparecían en
 * Movimientos; se veía lo que pagaba el cliente pero no lo que llevó.
 */

import { buildWholesaleLedger, LEDGER_SALE_METHODS, type LedgerPayment, type LedgerSale } from '../lib/wholesale-ledger.ts'

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

const item = (id: string, description: string, quantity: number, unit: string, subtotal: number) =>
  ({ id, description, unit, quantity, unit_price: subtotal / quantity, subtotal })

const sales: LedgerSale[] = [
  { id: 's1', sold_at: '2026-11-18T21:57:00+00:00', total: 5400, payment_method: 'Efectivo', items: [item('i1', 'Disco de horno', 2, 'unidad', 5400)] },
  { id: 's2', sold_at: '2026-11-19T12:00:00+00:00', total: 10000, payment_method: 'Cuenta corriente', items: [item('i2', 'Facturas', 20, 'unidad', 10000)] },
  { id: 's3', sold_at: '2026-11-20T22:07:00+00:00', total: 13600, payment_method: 'Efectivo', items: [item('i3', 'Miga', 3.575, 'kg', 13600)] },
  { id: 's4', sold_at: '2026-11-21T13:00:00+00:00', total: 8000, payment_method: 'Cuenta corriente', items: [item('i4', 'Pan', 2, 'kg', 8000)] },
  { id: 's5', sold_at: '2026-11-21T14:00:00+00:00', total: 3000, payment_method: 'Transferencia', items: [item('i5', '__MAYORISTA__:legacy-1', 1, 'unidad', 0), item('i6', 'Grisines', 0.4, 'kg', 3000)] },
]
const payments: LedgerPayment[] = [
  { id: 'p1', received_at: '2026-11-20T12:00:00+00:00', amount: 4000, payment_method: 'Efectivo', sale_id: null },
  // Pago parcial: la venta a cuenta y el abono quedan con la misma hora.
  { id: 'p2', received_at: '2026-11-21T13:00:00+00:00', amount: 3000, payment_method: 'Transferencia', sale_id: 's4' },
]

const rows = buildWholesaleLedger(sales, payments)
const byId = Object.fromEntries(rows.map(row => [row.id, row]))

console.log('Compras al contado')
t('aparecen en Movimientos', ['s1', 's3', 's5'].every(id => id in byId), true)
t('etiqueta con el medio de pago', [byId.s1.label, byId.s5.label], ['Compra al contado · Efectivo', 'Compra al contado · Transferencia'])
t('figuran en Debe y en Pagó por el mismo importe', [byId.s3.debit, byId.s3.credit], [13600, 13600])
t('muestran lo que llevó', byId.s3.items?.map(i => `${i.quantity} ${i.unit} ${i.description}`), ['3.575 kg Miga'])
t('no muestran los renglones internos viejos', byId.s5.items?.map(i => i.description), ['Grisines'])
t('una compra al contado sola deja saldo 0', buildWholesaleLedger([sales[0]], []).map(r => r.balance), [0])

console.log('Saldo de la cuenta')
t('venta a cuenta suma al saldo', [byId.s2.debit, byId.s2.credit, byId.s2.balance], [10000, 0, 10000])
t('cobro de cuenta resta', [byId.p1.label, byId.p1.balance], ['Cobro de cuenta · Efectivo', 6000])
t('la compra al contado no cambia el saldo', byId.s3.balance, byId.p1.balance)
t('abono al comprar va después de su venta', [byId.s4.balance, byId.p2.label, byId.p2.balance], [14000, 'Abono al comprar · Transferencia', 11000])
t('saldo final igual a ventas a cuenta menos cobros', rows[0].balance, 10000 + 8000 - 4000 - 3000)

console.log('Orden')
t('del más nuevo al más viejo', rows.map(r => r.id), ['s5', 'p2', 's4', 's3', 'p1', 's2', 's1'])
t('incluye efectivo y transferencia además de cuenta corriente', LEDGER_SALE_METHODS, ['Cuenta corriente', 'Efectivo', 'Transferencia'])

console.log(`\n${pass} ok, ${fail} con falla`)
if (fail > 0) process.exit(1)
