'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Info } from 'lucide-react'
import StockAudit from '../StockAudit'

export default function StockAuditPage() {
  const [supabase] = useState(() => createClient())

  return <div className="max-w-5xl mx-auto">
    <div className="mb-6">
      <h1 className="font-sans text-3xl font-bold text-charcoal">Registro de ventas y descuentos</h1>
      <p className="font-body text-warm-gray mt-1">Controlá que cada venta del día haya descontado del stock la cantidad correcta.</p>
    </div>
    <div className="mb-4 rounded-2xl border border-border bg-white p-4 shadow-sm flex gap-3">
      <Info size={19} className="text-burgundy mt-0.5 shrink-0" />
      <div className="font-body text-sm text-warm-gray space-y-1">
        <p><span className="font-semibold text-charcoal">Vendido:</span> lo que se cargó en el ticket (por ejemplo, 2 medias docenas).</p>
        <p><span className="font-semibold text-charcoal">Debía descontar:</span> cuánto stock representa esa venta (en el ejemplo, 12 unidades).</p>
        <p><span className="font-semibold text-charcoal">Se descontó:</span> lo que realmente bajó del stock. Si no coincide con lo que debía descontar, el renglón queda marcado como <span className="font-semibold text-red-700">Revisar</span>.</p>
        <p>Acá “descuento” significa lo que se resta del stock, no una rebaja de precio.</p>
      </div>
    </div>
    <StockAudit supabase={supabase} />
  </div>
}
