'use client'

import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { createClient } from '@/lib/supabase/client'
import {
  EXPENSE_METHODS, KIND_LABELS, SALARY_CONCEPTS, categoryLabel, monthLabel, money, parseAmount, todayStr, validAmount,
  type Employee, type Expense, type ExpenseCategory, type ExpenseKind, type ExpenseMethod,
} from '@/lib/expenses'

type Client = ReturnType<typeof createClient>
const field = 'w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white'

export default function ExpenseForm({ supabase, categories, employees, expense, preset, onClose, onSaved }: {
  supabase: Client
  categories: ExpenseCategory[]
  employees: Employee[]
  expense?: Expense | null
  preset?: { categoryId?: string; employeeId?: string }
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const presetEmployee = employees.find(employee => employee.id === preset?.employeeId)
  const [date, setDate] = useState(expense?.expense_date ?? todayStr())
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? preset?.categoryId ?? '')
  const [employeeId, setEmployeeId] = useState(expense?.employee_id ?? preset?.employeeId ?? '')
  const [description, setDescription] = useState(expense?.description ?? (presetEmployee ? 'Sueldo' : ''))
  const [payee, setPayee] = useState(expense?.payee ?? '')
  const [period, setPeriod] = useState(expense?.salary_period ?? (presetEmployee ? monthLabel(todayStr().slice(0, 7)) : ''))
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : presetEmployee?.salary ? String(presetEmployee.salary).replace('.', ',') : '')
  const [method, setMethod] = useState<ExpenseMethod>(expense?.payment_method ?? 'Efectivo')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  // Una categoría o un empleado dados de baja siguen visibles si el gasto ya los usa.
  const usableCategories = categories.filter(category => category.active || category.id === expense?.category_id)
  const usableEmployees = employees.filter(employee => employee.active || employee.id === expense?.employee_id)
  const category = categories.find(item => item.id === categoryId)
  const isSalary = category?.kind === 'sueldos'
  const concepts: string[] = [...SALARY_CONCEPTS]
  if (isSalary && description && !concepts.includes(description)) concepts.push(description)

  const chooseCategory = (id: string) => {
    const next = categories.find(item => item.id === id)
    setCategoryId(id)
    if (next?.kind === 'sueldos') {
      if (!concepts.includes(description)) setDescription('Sueldo')
      if (!period) setPeriod(monthLabel(date.slice(0, 7)))
    }
  }
  const chooseEmployee = (id: string) => {
    setEmployeeId(id)
    const employee = employees.find(item => item.id === id)
    if (employee?.salary && !amount.trim()) setAmount(String(employee.salary).replace('.', ','))
  }

  const save = async () => {
    if (savingRef.current) return
    const value = parseAmount(amount)
    if (!date) { setError('Elegí la fecha del gasto.'); return }
    if (!category) { setError('Elegí una categoría.'); return }
    if (isSalary && !employeeId) { setError('Elegí el empleado.'); return }
    if (!validAmount(value)) { setError('Ingresá un importe mayor que cero, con hasta dos decimales.'); return }
    const row = {
      expense_date: date,
      category_id: category.id,
      description: description.trim(),
      payee: isSalary || category.kind === 'personal' ? '' : payee.trim(),
      amount: value,
      payment_method: method,
      employee_id: isSalary ? employeeId : null,
      salary_period: isSalary ? period.trim() : '',
    }
    savingRef.current = true; setSaving(true); setError('')
    const { error: saveError } = expense
      ? await supabase.from('expenses').update(row).eq('id', expense.id)
      : await supabase.from('expenses').insert(row)
    savingRef.current = false; setSaving(false)
    if (saveError) { setError(saveError.message); return }
    onSaved(`${expense ? 'Gasto actualizado' : 'Gasto registrado'}: ${categoryLabel(category)} · ${money(value)}.`)
  }

  const groups = (['general', 'sueldos', 'personal'] as ExpenseKind[])
    .map(kind => [kind, usableCategories.filter(item => item.kind === kind)] as const)
    .filter(([, items]) => items.length > 0)

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
      <div className="p-4 border-b flex justify-between items-center">
        <b className="font-sans">{expense ? 'Editar gasto' : isSalary ? 'Registrar pago de sueldo' : 'Nuevo gasto'}</b>
        <button onClick={onClose} aria-label="Cerrar"><X /></button>
      </div>
      <div className="p-5 space-y-3">
        <label className="block text-xs text-warm-gray">Fecha
          <input type="date" value={date} onChange={event => setDate(event.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="block text-xs text-warm-gray">Categoría
          <select value={categoryId} onChange={event => chooseCategory(event.target.value)} className={`${field} mt-1`}>
            <option value="">Elegí una categoría</option>
            {groups.map(([kind, items]) => <optgroup key={kind} label={KIND_LABELS[kind]}>
              {items.map(item => <option key={item.id} value={item.id}>{kind === 'personal' ? `Personal · ${item.name}` : item.name}{item.active ? '' : ' (desactivada)'}</option>)}
            </optgroup>)}
          </select>
        </label>
        {isSalary ? <>
          <label className="block text-xs text-warm-gray">Empleado
            <select value={employeeId} onChange={event => chooseEmployee(event.target.value)} className={`${field} mt-1`}>
              <option value="">Elegí el empleado</option>
              {usableEmployees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.position ? ` · ${employee.position}` : ''}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-warm-gray">Concepto
              <select value={description} onChange={event => setDescription(event.target.value)} className={`${field} mt-1`}>
                {concepts.map(concept => <option key={concept}>{concept}</option>)}
              </select>
            </label>
            <label className="block text-xs text-warm-gray">Período
              <input value={period} onChange={event => setPeriod(event.target.value)} placeholder="octubre 2026" className={`${field} mt-1`} />
            </label>
          </div>
        </> : <>
          <label className="block text-xs text-warm-gray">Detalle
            <input value={description} onChange={event => setDescription(event.target.value)} placeholder={category?.kind === 'personal' ? '¿En qué se gastó?' : 'Ej.: Ingresos Brutos, harina, factura de luz'} className={`${field} mt-1`} />
          </label>
          {category?.kind !== 'personal' && <label className="block text-xs text-warm-gray">Proveedor o a quién se pagó (opcional)
            <input value={payee} onChange={event => setPayee(event.target.value)} className={`${field} mt-1`} />
          </label>}
        </>}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-warm-gray">Importe
            <input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" className={`${field} mt-1 font-num`} />
          </label>
          <label className="block text-xs text-warm-gray">Medio de pago
            <select value={method} onChange={event => setMethod(event.target.value as ExpenseMethod)} className={`${field} mt-1`}>
              {EXPENSE_METHODS.map(option => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-warm-gray">Es un registro aparte: no descuenta dinero de la caja del mostrador.</p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button onClick={() => void save()} disabled={saving} className="w-full py-3 bg-burgundy text-cream rounded-xl font-semibold disabled:opacity-40">
          {saving ? 'Guardando...' : expense ? 'Guardar cambios' : 'Registrar'}
        </button>
      </div>
    </div>
  </div>
}
