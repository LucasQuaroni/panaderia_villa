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
  const transfers = rows.filter(row => row.payment_method === 'Transferencia')
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-border bg-cream-dark p-3">
        <h3 className="text-xs font-semibold text-warm-gray">Total efectivo</h3>
        <p className="font-num text-lg font-bold text-charcoal mt-1">{money(totals.cash)}</p>
        <p className="text-[11px] text-warm-gray mt-1">Sin el fondo inicial</p>
      </div>
      <div className="rounded-xl border border-burgundy/20 bg-burgundy/5 p-3">
        <h3 className="text-xs font-semibold text-burgundy">Total transferencias</h3>
        <p className="font-num text-lg font-bold text-burgundy mt-1">{money(totals.transfer)}</p>
        <p className="text-[11px] text-warm-gray mt-1">Ventas, cobros de cuentas y ajustes</p>
      </div>
    </div>
    <details><summary className="cursor-pointer font-semibold text-sm text-burgundy">Ver transferencias ({transfers.length})</summary>
      <MovementList rows={transfers} compact={compact} emptyMessage="Sin transferencias en esta caja." />
    </details>
    <div className="border border-border rounded-xl divide-y divide-border/60 text-sm">
      {groups.map(([label, entries]) => { const sum = summarizeCash([...entries]); return <div key={label} className="p-3"><b>{label}</b><div className="flex justify-between gap-2 text-warm-gray text-xs mt-1"><span>Efectivo {money(sum.cash)}</span><span>Transferencia {money(sum.transfer)}</span></div></div> })}
      <div className="p-3 bg-cream/50 flex justify-between font-bold"><span>Total ingresado</span><span className="font-num text-burgundy">{money(totals.total)}</span></div>
    </div>
    <details><summary className="cursor-pointer font-semibold text-sm text-burgundy">Ver movimientos ({rows.length})</summary>
      <MovementList rows={rows} compact={compact} emptyMessage="Sin ingresos en esta caja." />
    </details>
  </div>
}

function MovementList({ rows, compact, emptyMessage }: { rows: CashMovement[]; compact: boolean; emptyMessage: string }) {
  return <div className={`${compact ? 'max-h-60' : 'max-h-96'} overflow-auto mt-2 border rounded-xl divide-y`}>
    {rows.length === 0 && <p className="p-4 text-sm text-warm-gray">{emptyMessage}</p>}
    {rows.map(row => <div key={row.id} className="p-3 flex justify-between gap-3 text-sm"><div><b>{row.customer_name}</b><p className="text-xs text-warm-gray">{cashMovementLabel(row)} · {row.payment_method}</p><p className="text-xs text-warm-gray">{new Date(row.occurred_at).toLocaleString('es-AR')}</p>{row.amount < 0 && <p className="text-xs text-red-700">Salida por corrección</p>}</div><span className={`font-num font-bold whitespace-nowrap ${row.amount < 0 ? 'text-red-700' : 'text-green-700'}`}>{money(Number(row.amount))}</span></div>)}
  </div>
}
