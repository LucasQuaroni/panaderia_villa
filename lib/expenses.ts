import type { createClient } from '@/lib/supabase/client'

export type ExpenseKind = 'general' | 'sueldos' | 'personal'
export const EXPENSE_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro'] as const
export type ExpenseMethod = typeof EXPENSE_METHODS[number]
export const PAY_FREQUENCIES = ['Mensual', 'Quincenal', 'Semanal'] as const
export type PayFrequency = typeof PAY_FREQUENCIES[number]
export const SALARY_CONCEPTS = ['Sueldo', 'Adelanto', 'Aguinaldo', 'Vacaciones', 'Otro'] as const

export interface ExpenseCategory { id: string; name: string; kind: ExpenseKind; active: boolean }
export interface Employee {
  id: string
  full_name: string
  position: string
  document: string
  phone: string
  start_date: string | null
  salary: number
  pay_frequency: PayFrequency
  notes: string
  active: boolean
}
export interface Expense {
  id: string
  expense_date: string
  category_id: string
  description: string
  payee: string
  amount: number
  payment_method: ExpenseMethod
  employee_id: string | null
  salary_period: string
  voided_at: string | null
}

export const KIND_LABELS: Record<ExpenseKind, string> = {
  general: 'Gastos de la panadería',
  sueldos: 'Sueldos',
  personal: 'Gastos personales',
}
export const categoryLabel = (category: ExpenseCategory) => category.kind === 'personal' ? `Personal · ${category.name}` : category.name

export const money = (amount: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(amount)
export const parseAmount = (value: string) => value.trim() === '' ? NaN : Number(value.trim().replace(',', '.'))
export const validAmount = (value: number) => Number.isFinite(value) && value > 0 && value < 10000000000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001
export const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-AR')
export const centsSum = (values: number[]) => values.reduce((cents, value) => cents + Math.round(Number(value) * 100), 0) / 100

const pad = (value: number) => String(value).padStart(2, '0')
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
export const currentMonth = () => todayStr().slice(0, 7)
export const shiftMonth = (month: string, delta: number) => {
  const [year, index] = month.split('-').map(Number)
  const d = new Date(year, index - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** Rango [from, to) de fechas YYYY-MM-DD para un mes YYYY-MM. */
export const monthRange = (month: string) => ({ from: `${month}-01`, to: `${shiftMonth(month, 1)}-01` })
export const monthLabel = (month: string) => {
  const [year, index] = month.split('-').map(Number)
  const label = new Date(year, index - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}
export const fmtDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

type Client = ReturnType<typeof createClient>
const EXPENSE_COLUMNS = 'id,expense_date,category_id,description,payee,amount,payment_method,employee_id,salary_period,voided_at'

export async function loadExpenses(client: Client, filter: { from?: string; to?: string; salaryOnly?: boolean }) {
  const rows: Expense[] = []
  for (let offset = 0; ; offset += 500) {
    let query = client.from('expenses').select(EXPENSE_COLUMNS)
    if (filter.from) query = query.gte('expense_date', filter.from)
    if (filter.to) query = query.lt('expense_date', filter.to)
    if (filter.salaryOnly) query = query.not('employee_id', 'is', null)
    const { data, error } = await query.order('expense_date', { ascending: false }).order('created_at', { ascending: false }).range(offset, offset + 499)
    if (error) throw new Error(`No se pudieron cargar los gastos: ${error.message}`)
    rows.push(...((data ?? []) as Expense[]).map(row => ({ ...row, amount: Number(row.amount) })))
    if ((data ?? []).length < 500) return rows
  }
}

export async function loadExpenseCatalog(client: Client) {
  const [categories, employees] = await Promise.all([
    client.from('expense_categories').select('id,name,kind,active').order('name'),
    client.from('employees').select('id,full_name,position,document,phone,start_date,salary,pay_frequency,notes,active').order('full_name'),
  ])
  if (categories.error || employees.error) throw new Error(categories.error?.message ?? employees.error?.message)
  return {
    categories: (categories.data ?? []) as ExpenseCategory[],
    employees: ((employees.data ?? []) as Employee[]).map(row => ({ ...row, salary: Number(row.salary) })),
  }
}
