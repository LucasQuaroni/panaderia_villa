'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ExpenseForm from '@/components/admin/ExpenseForm'
import {
  PAY_FREQUENCIES, centsSum, currentMonth, fmtDay, loadExpenseCatalog, loadExpenses, money, monthLabel, monthRange, parseAmount, shiftMonth,
  type Employee, type Expense, type ExpenseCategory, type PayFrequency,
} from '@/lib/expenses'
import { ChevronLeft, ChevronRight, HandCoins, Pencil, Plus, RotateCcw, X } from 'lucide-react'

type Client = ReturnType<typeof createClient>
type FormState = { expense?: Expense; employeeId?: string } | null
const field = 'w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white'
const blankEmployee = (): Employee => ({ id: '', full_name: '', position: '', document: '', phone: '', start_date: null, salary: 0, pay_frequency: 'Mensual', notes: '', active: true })

export default function SueldosPage() {
  const supabase = createClient()
  const [month, setMonth] = useState(currentMonth())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [payments, setPayments] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [history, setHistory] = useState<Employee | null>(null)
  const [form, setForm] = useState<FormState>(null)

  const load = useCallback(async () => {
    try {
      const [catalog, rows] = await Promise.all([loadExpenseCatalog(supabase), loadExpenses(supabase, { salaryOnly: true })])
      setCategories(catalog.categories); setEmployees(catalog.employees); setPayments(rows); setError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los empleados.') }
    setLoading(false)
  }, [supabase])
  useEffect(() => { void load() }, [load])

  const salaryCategory = categories.find(category => category.kind === 'sueldos')
  const { from, to } = monthRange(month)
  const valid = useMemo(() => payments.filter(payment => !payment.voided_at), [payments])
  const paidInMonth = (employeeId: string) => centsSum(valid.filter(payment => payment.employee_id === employeeId && payment.expense_date >= from && payment.expense_date < to).map(payment => payment.amount))
  const lastPayment = (employeeId: string) => valid.find(payment => payment.employee_id === employeeId)
  const monthTotal = centsSum(valid.filter(payment => payment.expense_date >= from && payment.expense_date < to).map(payment => payment.amount))
  const shown = employees.filter(employee => employee.active || showInactive).sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name, 'es-AR'))

  const saved = async (text: string) => { setForm(null); setEditing(null); setMessage(text); await load() }
  const toggle = async (employee: Employee) => {
    if (!window.confirm(`¿Confirmás ${employee.active ? 'dar de baja' : 'reactivar'} a ${employee.full_name}? Se conservan todos sus pagos.`)) return
    const { error: updateError } = await supabase.from('employees').update({ active: !employee.active }).eq('id', employee.id)
    if (updateError) { setError(updateError.message); return }
    await saved(employee.active ? 'Empleado dado de baja.' : 'Empleado reactivado.')
  }
  const pay = (employeeId: string) => {
    if (!salaryCategory) { setError('Falta la categoría Sueldos. Revisá que la migración 012 esté aplicada.'); return }
    setForm({ employeeId })
  }

  if (loading) return <div className="text-center py-20 font-body text-warm-gray">Cargando empleados...</div>

  return <div className="max-w-6xl mx-auto">
    <div className="mb-6">
      <h1 className="font-sans text-3xl font-bold text-charcoal">Empleados y sueldos</h1>
      <p className="font-body text-warm-gray mt-1">Perfil de cada empleado, su sueldo y los pagos realizados. Los pagos se suman en Gastos, dentro de Sueldos.</p>
    </div>
    {error && <p className="mb-4 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">{error}</p>}
    {message && <p className="mb-4 px-4 py-3 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">{message}</p>}

    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2 bg-white border border-border rounded-xl p-1">
        <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-lg hover:bg-cream" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
        <span className="px-2 font-semibold min-w-36 text-center">{monthLabel(month)}</span>
        <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-2 rounded-lg hover:bg-cream" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="text-sm text-warm-gray flex gap-2 items-center"><input type="checkbox" checked={showInactive} onChange={event => setShowInactive(event.target.checked)} />Mostrar dados de baja</label>
        <button onClick={() => setEditing(blankEmployee())} className="flex gap-2 items-center px-4 py-2.5 bg-burgundy text-cream rounded-xl font-semibold"><Plus size={16} />Nuevo empleado</button>
      </div>
    </div>

    <div className="mb-4 bg-burgundy text-cream rounded-2xl p-5 shadow-md">
      <p className="text-sm text-cream/70">Pagado en sueldos · {monthLabel(month)}</p>
      <p className="font-num text-3xl font-bold mt-1">{money(monthTotal)}</p>
    </div>

    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead><tr className="bg-cream-dark text-left text-xs text-warm-gray"><th className="p-3">Empleado</th><th className="p-3 text-right">Sueldo</th><th className="p-3 text-right">Pagado en el mes</th><th className="p-3">Último pago</th><th className="p-3 text-right">Acciones</th></tr></thead>
        <tbody>
          {shown.map(employee => {
            const last = lastPayment(employee.id)
            return <tr key={employee.id} className={`border-t border-border/60 ${employee.active ? '' : 'opacity-50'}`}>
              <td className="p-3">
                <b>{employee.full_name}</b>{!employee.active && <span className="text-xs text-warm-gray"> · Dado de baja</span>}
                <div className="text-xs text-warm-gray">{[employee.position, employee.document && `DNI/CUIL ${employee.document}`, employee.phone, employee.start_date && `Ingresó ${fmtDay(employee.start_date)}`].filter(Boolean).join(' · ') || '—'}</div>
              </td>
              <td className="p-3 text-right whitespace-nowrap"><span className="font-num font-semibold">{money(employee.salary)}</span><div className="text-xs text-warm-gray">{employee.pay_frequency}</div></td>
              <td className="p-3 text-right font-num font-semibold whitespace-nowrap">{money(paidInMonth(employee.id))}</td>
              <td className="p-3 text-xs text-warm-gray">{last ? <>{fmtDay(last.expense_date)} · {last.description || 'Sueldo'}<div className="font-num text-charcoal">{money(last.amount)}</div></> : 'Sin pagos'}</td>
              <td className="p-3 text-right whitespace-nowrap">
                {employee.active && <button onClick={() => pay(employee.id)} className="inline-flex gap-1 items-center bg-burgundy text-cream rounded px-2 py-1 text-xs mr-2"><HandCoins size={12} />Registrar pago</button>}
                <button onClick={() => setHistory(employee)} className="border rounded px-2 py-1 text-xs mr-2">Pagos</button>
                <button onClick={() => setEditing(employee)} className="border rounded px-2 py-1 text-xs mr-2">Editar</button>
                <button onClick={() => void toggle(employee)} className="border rounded px-2 py-1 text-xs">{employee.active ? 'Dar de baja' : 'Reactivar'}</button>
              </td>
            </tr>
          })}
          {shown.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-warm-gray">Todavía no hay empleados cargados.</td></tr>}
        </tbody>
      </table>
    </div>

    {editing && <EmployeeModal supabase={supabase} employee={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    {history && <PaymentHistory supabase={supabase} employee={history} payments={payments.filter(payment => payment.employee_id === history.id)}
      onClose={() => setHistory(null)} onEdit={expense => setForm({ expense })} onChanged={async text => { setMessage(text); await load() }} />}
    {form && <ExpenseForm supabase={supabase} categories={categories} employees={employees} expense={form.expense}
      preset={{ categoryId: salaryCategory?.id, employeeId: form.employeeId }} onClose={() => setForm(null)} onSaved={saved} />}
  </div>
}

function EmployeeModal({ supabase, employee, onClose, onSaved }: { supabase: Client; employee: Employee; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [draft, setDraft] = useState(employee)
  const [salary, setSalary] = useState(employee.salary ? String(employee.salary).replace('.', ',') : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const set = <K extends keyof Employee>(key: K, value: Employee[K]) => setDraft(previous => ({ ...previous, [key]: value }))

  const save = async () => {
    if (savingRef.current) return
    const value = salary.trim() === '' ? 0 : parseAmount(salary)
    if (!draft.full_name.trim()) { setError('Ingresá el nombre del empleado.'); return }
    if (!Number.isFinite(value) || value < 0) { setError('Revisá el sueldo.'); return }
    const row = {
      full_name: draft.full_name.trim(), position: draft.position.trim(), document: draft.document.trim(), phone: draft.phone.trim(),
      start_date: draft.start_date || null, salary: Math.round(value * 100) / 100, pay_frequency: draft.pay_frequency, notes: draft.notes.trim(),
    }
    savingRef.current = true; setSaving(true); setError('')
    const { error: saveError } = draft.id
      ? await supabase.from('employees').update(row).eq('id', draft.id)
      : await supabase.from('employees').insert(row)
    savingRef.current = false; setSaving(false)
    if (saveError) { setError(saveError.message); return }
    await onSaved(draft.id ? 'Datos del empleado actualizados.' : 'Empleado agregado.')
  }

  return <Modal title={employee.id ? `Editar · ${employee.full_name}` : 'Nuevo empleado'} onClose={onClose}>
    <div className="space-y-3">
      <label className="block text-xs text-warm-gray">Nombre y apellido<input value={draft.full_name} onChange={event => set('full_name', event.target.value)} className={`${field} mt-1`} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-warm-gray">Puesto<input value={draft.position} onChange={event => set('position', event.target.value)} placeholder="Atención, panadero..." className={`${field} mt-1`} /></label>
        <label className="block text-xs text-warm-gray">DNI / CUIL<input value={draft.document} onChange={event => set('document', event.target.value)} className={`${field} mt-1`} /></label>
        <label className="block text-xs text-warm-gray">Teléfono<input value={draft.phone} onChange={event => set('phone', event.target.value)} className={`${field} mt-1`} /></label>
        <label className="block text-xs text-warm-gray">Fecha de ingreso<input type="date" value={draft.start_date ?? ''} onChange={event => set('start_date', event.target.value || null)} className={`${field} mt-1`} /></label>
        <label className="block text-xs text-warm-gray">Sueldo<input inputMode="decimal" value={salary} onChange={event => setSalary(event.target.value)} placeholder="0" className={`${field} mt-1 font-num`} /></label>
        <label className="block text-xs text-warm-gray">Se paga<select value={draft.pay_frequency} onChange={event => set('pay_frequency', event.target.value as PayFrequency)} className={`${field} mt-1`}>{PAY_FREQUENCIES.map(option => <option key={option}>{option}</option>)}</select></label>
      </div>
      <label className="block text-xs text-warm-gray">Notas<textarea value={draft.notes} onChange={event => set('notes', event.target.value)} rows={2} className={`${field} mt-1`} /></label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button onClick={() => void save()} disabled={saving} className="w-full py-3 bg-burgundy text-cream rounded-xl font-semibold disabled:opacity-40">{saving ? 'Guardando...' : 'Guardar empleado'}</button>
    </div>
  </Modal>
}

function PaymentHistory({ supabase, employee, payments, onClose, onEdit, onChanged }: {
  supabase: Client; employee: Employee; payments: Expense[]; onClose: () => void; onEdit: (expense: Expense) => void; onChanged: (message: string) => Promise<void>
}) {
  const [error, setError] = useState('')
  const setVoided = async (payment: Expense, voided: boolean) => {
    if (!window.confirm(voided ? `¿Anular el pago de ${money(payment.amount)} del ${fmtDay(payment.expense_date)}? Queda registrado pero deja de sumar.` : `¿Restaurar el pago de ${money(payment.amount)}?`)) return
    const { error: updateError } = await supabase.from('expenses').update({ voided_at: voided ? new Date().toISOString() : null }).eq('id', payment.id)
    if (updateError) { setError(updateError.message); return }
    await onChanged(voided ? 'Pago anulado.' : 'Pago restaurado.')
  }
  const year = new Date().getFullYear()
  const yearTotal = centsSum(payments.filter(payment => !payment.voided_at && payment.expense_date.startsWith(String(year))).map(payment => payment.amount))

  return <Modal title={`Pagos · ${employee.full_name}`} onClose={onClose} wide>
    <p className="text-sm text-warm-gray mb-3">Pagado en {year}: <b className="font-num text-charcoal">{money(yearTotal)}</b></p>
    {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
    {payments.length === 0 ? <p className="text-sm text-warm-gray">Todavía no hay pagos registrados.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
      <thead><tr className="bg-cream-dark text-left text-xs text-warm-gray"><th className="p-2">Fecha</th><th className="p-2">Concepto</th><th className="p-2">Medio</th><th className="p-2 text-right">Importe</th><th className="p-2" /></tr></thead>
      <tbody>{payments.map(payment => <tr key={payment.id} className={`border-t border-border/60 ${payment.voided_at ? 'opacity-60' : ''}`}>
        <td className="p-2 whitespace-nowrap">{fmtDay(payment.expense_date)}</td>
        <td className="p-2">{payment.description || 'Sueldo'}{payment.salary_period ? ` · ${payment.salary_period}` : ''}{payment.voided_at && <span className="ml-2 text-xs text-red-700">Anulado</span>}</td>
        <td className="p-2">{payment.payment_method}</td>
        <td className={`p-2 text-right font-num font-semibold ${payment.voided_at ? 'line-through' : ''}`}>{money(payment.amount)}</td>
        <td className="p-2 text-right whitespace-nowrap">{payment.voided_at
          ? <button onClick={() => void setVoided(payment, false)} className="inline-flex gap-1 items-center border rounded px-2 py-1 text-xs"><RotateCcw size={12} />Restaurar</button>
          : <><button onClick={() => onEdit(payment)} className="inline-flex gap-1 items-center border rounded px-2 py-1 text-xs mr-1"><Pencil size={12} />Editar</button><button onClick={() => void setVoided(payment, true)} className="border rounded px-2 py-1 text-xs text-red-700">Anular</button></>}
        </td>
      </tr>)}</tbody>
    </table></div>}
  </Modal>
}

function Modal({ title, onClose, wide = false, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className={`bg-white rounded-3xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={event => event.stopPropagation()}>
      <div className="p-4 border-b flex justify-between items-center"><b className="font-sans">{title}</b><button onClick={onClose} aria-label="Cerrar"><X /></button></div>
      <div className="p-5">{children}</div>
    </div>
  </div>
}
