'use client'

import { cashMovementLabel, summarizeCash, type CashMovement } from '@/lib/pos/cash'
const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(amount)

export default function CashMovements({ rows, compact = false }: { rows: CashMovement[]; compact?: boolean }) {
  const groups = [
    ['Ventas minoristas', rows.filter(row => row.source === 'sale' && row.sale_channel === 'minorista')],
    ['Ventas mayoristas', rows.filter(row => row.source === 'sale' && row.sale_channel === 'mayorista')],
    ['Cobros de fiados minoristas', rows.filter(row => row.source === 'account_payment' && row.sale_channel === 'minorista')],
    ['Cobros de cuentas mayoristas', rows.filter(row => row.source === 'account_payment' && row.sale_channel === 'mayorista')],
    ['Ajustes por correcciones', rows.filter(row => row.source === 'correction')],
  ] as const
  const totals = summarizeCash(rows)
  return <div className="space-y-3">
    <div className="border border-border rounded-xl divide-y divide-border/60 text-sm">
      {groups.map(([label, entries]) => { const sum = summarizeCash([...entries]); return <div key={label} className="p-3"><b>{label}</b><div className="flex justify-between gap-2 text-warm-gray text-xs mt-1"><span>Efectivo {money(sum.cash)}</span><span>Transferencia {money(sum.transfer)}</span></div></div> })}
      <div className="p-3 bg-cream/50 flex justify-between font-bold"><span>Total ingresado</span><span className="font-num text-burgundy">{money(totals.total)}</span></div>
    </div>
    <details><summary className="cursor-pointer font-semibold text-sm text-burgundy">Ver movimientos ({rows.length})</summary>
      <div className={`${compact ? 'max-h-60' : 'max-h-96'} overflow-auto mt-2 border rounded-xl divide-y`}>
        {rows.length === 0 && <p className="p-4 text-sm text-warm-gray">Sin ingresos en esta caja.</p>}
        {rows.map(row => <div key={row.id} className="p-3 flex justify-between gap-3 text-sm"><div><b>{row.customer_name}</b><p className="text-xs text-warm-gray">{cashMovementLabel(row)} · {row.payment_method}</p><p className="text-xs text-warm-gray">{new Date(row.occurred_at).toLocaleString('es-AR')}</p>{row.amount < 0 && <p className="text-xs text-red-700">Salida por corrección</p>}</div><span className={`font-num font-bold whitespace-nowrap ${row.amount < 0 ? 'text-red-700' : 'text-green-700'}`}>{money(Number(row.amount))}</span></div>)}
      </div>
    </details>
  </div>
}
