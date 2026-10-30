'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ExpenseForm from '@/components/admin/ExpenseForm'
import {
  KIND_LABELS, categoryLabel, centsSum, fmtDay, loadExpenseCatalog, loadExpenses, money, monthLabel, monthRange, normalize, shiftMonth, currentMonth,
  type Employee, type Expense, type ExpenseCategory, type ExpenseKind,
} from '@/lib/expenses'
import { ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, RotateCcw, Search, Tags } from 'lucide-react'

type Tab = 'gastos' | 'categorias'
type FormState = { expense?: Expense; preset?: { categoryId?: string } } | null
const field = 'w-full px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy bg-white'
const KINDS: ExpenseKind[] = ['general', 'sueldos', 'personal']

export default function GastosPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('gastos')
  const [month, setMonth] = useState(currentMonth())
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showVoided, setShowVoided] = useState(false)
  const [form, setForm] = useState<FormState>(null)

  const load = useCallback(async () => {
    try {
      const { from, to } = monthRange(month)
      const [catalog, rows] = await Promise.all([loadExpenseCatalog(supabase), loadExpenses(supabase, { from, to })])
      setCategories(catalog.categories); setEmployees(catalog.employees); setExpenses(rows); setError('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron cargar los gastos.') }
    setLoading(false)
  }, [supabase, month])
  useEffect(() => { void load() }, [load])

  const categoryById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees])
  const active = expenses.filter(expense => !expense.voided_at)

  const summary = useMemo(() => KINDS.map(kind => {
    const rows = active.filter(expense => categoryById.get(expense.category_id)?.kind === kind)
    const groups = new Map<string, { key: string; label: string; categoryId: string; amounts: number[] }>()
    for (const row of rows) {
      // Los sueldos se abren por empleado; el resto, por categoría.
      const key = kind === 'sueldos' ? row.employee_id ?? '' : row.category_id
      const label = kind === 'sueldos' ? employeeById.get(row.employee_id ?? '')?.full_name ?? 'Sin empleado' : categoryById.get(row.category_id)?.name ?? '—'
      const group = groups.get(key) ?? { key, label, categoryId: row.category_id, amounts: [] }
      group.amounts.push(row.amount); groups.set(key, group)
    }
    const lines = [...groups.values()].map(group => ({ ...group, total: centsSum(group.amounts) })).sort((a, b) => b.total - a.total)
    return { kind, total: centsSum(rows.map(row => row.amount)), lines }
  }), [active, categoryById, employeeById])
  const monthTotal = centsSum(active.map(expense => expense.amount))

  const detailOf = (expense: Expense) => {
    const category = categoryById.get(expense.category_id)
    if (category?.kind === 'sueldos') {
      const employee = employeeById.get(expense.employee_id ?? '')?.full_name ?? 'Empleado'
      return `${expense.description || 'Sueldo'} · ${employee}${expense.salary_period ? ` (${expense.salary_period})` : ''}`
    }
    return [expense.description, expense.payee].filter(Boolean).join(' · ') || '—'
  }
  const shown = expenses.filter(expense => {
    if (expense.voided_at && !showVoided) return false
    const category = categoryById.get(expense.category_id)
    if (filter.startsWith('kind:') ? category?.kind !== filter.slice(5) : filter && expense.category_id !== filter) return false
    return normalize(`${detailOf(expense)} ${category ? categoryLabel(category) : ''}`).includes(normalize(search))
  })

  const setVoided = async (expense: Expense, voided: boolean) => {
    const category = categoryById.get(expense.category_id)
    const question = voided
      ? `¿Anular ${category ? categoryLabel(category) : 'el gasto'} de ${money(expense.amount)} del ${fmtDay(expense.expense_date)}? Deja de sumar, pero queda registrado.`
      : `¿Restaurar el gasto de ${money(expense.amount)}?`
    if (!window.confirm(question)) return
    const { error: updateError } = await supabase.from('expenses').update({ voided_at: voided ? new Date().toISOString() : null }).eq('id', expense.id)
    if (updateError) { setError(updateError.message); return }
    setMessage(voided ? 'Gasto anulado.' : 'Gasto restaurado.'); await load()
  }

  if (loading) return <div className="text-center py-20 font-body text-warm-gray">Cargando gastos...</div>

  return <div className="max-w-6xl mx-auto">
    <div className="mb-6">
      <h1 className="font-sans text-3xl font-bold text-charcoal">Gastos</h1>
      <p className="font-body text-warm-gray mt-1">Pagos de la panadería, sueldos y gastos personales, separados por categoría. Es un registro aparte: no modifica la caja.</p>
    </div>
    <div className="flex flex-wrap gap-2 mb-5 bg-white border border-border rounded-xl p-1 w-fit">
      {([['gastos', 'Gastos del mes', ReceiptText], ['categorias', 'Categorías', Tags]] as const).map(([value, label, Icon]) =>
        <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-lg text-sm font-semibold flex gap-2 items-center ${tab === value ? 'bg-burgundy text-cream' : 'text-warm-gray'}`}><Icon size={16} />{label}</button>)}
    </div>
    {error && <p className="mb-4 px-4 py-3 rounded-xl border bg-red-50 border-red-200 text-red-700 text-sm">{error}</p>}
    {message && <p className="mb-4 px-4 py-3 rounded-xl border bg-green-50 border-green-200 text-green-800 text-sm">{message}</p>}

    {tab === 'categorias' ? <Categories supabase={supabase} categories={categories} onChanged={async text => { setMessage(text); await load() }} onError={setError} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-border rounded-xl p-1">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-2 rounded-lg hover:bg-cream" aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <span className="px-2 font-semibold min-w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-2 rounded-lg hover:bg-cream" aria-label="Mes siguiente"><ChevronRight size={18} /></button>
        </div>
        <button onClick={() => setForm({})} className="flex gap-2 items-center px-4 py-2.5 bg-burgundy text-cream rounded-xl font-semibold"><Plus size={16} />Nuevo gasto</button>
      </div>

      <div className="mb-4 bg-burgundy text-cream rounded-2xl p-5 shadow-md">
        <p className="text-sm text-cream/70">Total de gastos · {monthLabel(month)}</p>
        <p className="font-num text-3xl font-bold mt-1">{money(monthTotal)}</p>
        <p className="text-xs text-cream/70 mt-1">{active.length} gasto(s) registrados{expenses.length > active.length ? ` · ${expenses.length - active.length} anulado(s) no suman` : ''}</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {summary.map(group => <div key={group.kind} className="bg-white rounded-2xl border border-border shadow-sm p-4">
          <button onClick={() => setFilter(filter === `kind:${group.kind}` ? '' : `kind:${group.kind}`)} className="w-full flex justify-between items-baseline gap-2 text-left">
            <h2 className="font-sans font-bold text-charcoal">{KIND_LABELS[group.kind]}</h2>
            <span className="font-num font-bold text-burgundy">{money(group.total)}</span>
          </button>
          <div className="mt-3 divide-y divide-border/60 text-sm">
            {group.lines.length === 0 && <p className="text-xs text-warm-gray py-1">Sin gastos este mes.</p>}
            {group.lines.map(line => <button key={line.key} onClick={() => setFilter(group.kind === 'sueldos' ? 'kind:sueldos' : line.categoryId)} className="w-full flex justify-between gap-2 py-1.5 text-left hover:text-burgundy">
              <span className="truncate">{line.label}</span><span className="font-num whitespace-nowrap">{money(line.total)}</span>
            </button>)}
          </div>
        </div>)}
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm">
        <div className="p-4 border-b border-border grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <div className="relative"><Search size={16} className="absolute left-3 top-3 text-warm-gray" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por detalle, proveedor o empleado" className={`${field} pl-9`} /></div>
          <select value={filter} onChange={event => setFilter(event.target.value)} className={field}>
            <option value="">Todas las categorías</option>
            {KINDS.map(kind => <optgroup key={kind} label={KIND_LABELS[kind]}>
              <option value={`kind:${kind}`}>Todo: {KIND_LABELS[kind].toLowerCase()}</option>
              {kind !== 'sueldos' && categories.filter(category => category.kind === kind).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </optgroup>)}
          </select>
          <label className="text-sm text-warm-gray flex gap-2 items-center whitespace-nowrap"><input type="checkbox" checked={showVoided} onChange={event => setShowVoided(event.target.checked)} />Mostrar anulados</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="bg-cream-dark text-left text-xs text-warm-gray"><th className="p-3">Fecha</th><th className="p-3">Categoría</th><th className="p-3">Detalle</th><th className="p-3">Medio</th><th className="p-3 text-right">Importe</th><th className="p-3 text-right">Acciones</th></tr></thead>
            <tbody>
              {shown.map(expense => {
                const category = categoryById.get(expense.category_id)
                return <tr key={expense.id} className={`border-t border-border/60 ${expense.voided_at ? 'opacity-60' : ''}`}>
                  <td className="p-3 whitespace-nowrap">{fmtDay(expense.expense_date)}</td>
                  <td className="p-3">{category ? categoryLabel(category) : '—'}</td>
                  <td className="p-3">{detailOf(expense)}{expense.voided_at && <span className="ml-2 text-xs text-red-700">Anulado</span>}</td>
                  <td className="p-3 whitespace-nowrap">{expense.payment_method}</td>
                  <td className={`p-3 text-right font-num font-semibold whitespace-nowrap ${expense.voided_at ? 'line-through' : ''}`}>{money(expense.amount)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {expense.voided_at
                      ? <button onClick={() => void setVoided(expense, false)} className="inline-flex gap-1 items-center border rounded px-2 py-1 text-xs"><RotateCcw size={12} />Restaurar</button>
                      : <><button onClick={() => setForm({ expense })} className="inline-flex gap-1 items-center border rounded px-2 py-1 text-xs mr-2"><Pencil size={12} />Editar</button><button onClick={() => void setVoided(expense, true)} className="border rounded px-2 py-1 text-xs text-red-700">Anular</button></>}
                  </td>
                </tr>
              })}
              {shown.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-warm-gray">{expenses.length ? 'Sin gastos que coincidan con el filtro.' : 'Todavía no hay gastos en este mes.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {shown.length > 0 && <div className="p-3 border-t border-border flex justify-between text-sm font-bold"><span>Total mostrado</span><span className="font-num text-burgundy">{money(centsSum(shown.filter(expense => !expense.voided_at).map(expense => expense.amount)))}</span></div>}
      </div>
    </>}

    {form && <ExpenseForm supabase={supabase} categories={categories} employees={employees} expense={form.expense} preset={form.preset}
      onClose={() => setForm(null)}
      onSaved={async text => { setForm(null); setMessage(text); await load() }} />}
  </div>
}

function Categories({ supabase, categories, onChanged, onError }: {
  supabase: ReturnType<typeof createClient>
  categories: ExpenseCategory[]
  onChanged: (message: string) => Promise<void>
  onError: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'general' | 'personal'>('general')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const explain = (message: string) => message.includes('expense_categories_name_idx') ? 'Ya existe una categoría con ese nombre.' : message

  const create = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    const { error } = await supabase.from('expense_categories').insert({ name: name.trim(), kind })
    setBusy(false)
    if (error) { onError(explain(error.message)); return }
    setName(''); await onChanged('Categoría agregada.')
  }
  const rename = async (category: ExpenseCategory) => {
    const next = (drafts[category.id] ?? '').trim()
    if (!next || next === category.name) return
    const { error } = await supabase.from('expense_categories').update({ name: next }).eq('id', category.id)
    if (error) { onError(explain(error.message)); return }
    setDrafts(previous => { const copy = { ...previous }; delete copy[category.id]; return copy })
    await onChanged('Nombre actualizado. Los gastos anteriores muestran el nombre nuevo.')
  }
  const toggle = async (category: ExpenseCategory) => {
    const { error } = await supabase.from('expense_categories').update({ active: !category.active }).eq('id', category.id)
    if (error) { onError(error.message); return }
    await onChanged(category.active ? 'Categoría desactivada. Sus gastos anteriores se conservan.' : 'Categoría activada.')
  }

  return <div className="space-y-4">
    <div className="bg-white rounded-2xl border border-border shadow-sm p-5">
      <h2 className="font-sans font-bold mb-1">Nueva categoría</h2>
      <p className="text-xs text-warm-gray mb-3">Para gastos personales, la categoría lleva el nombre de la persona (por ejemplo, Vale o Estela).</p>
      <div className="grid sm:grid-cols-[1fr_220px_auto] gap-3">
        <input value={name} onChange={event => setName(event.target.value)} placeholder="Nombre" className={field} />
        <select value={kind} onChange={event => setKind(event.target.value as 'general' | 'personal')} className={field}>
          <option value="general">Gasto de la panadería</option>
          <option value="personal">Gasto personal (persona)</option>
        </select>
        <button onClick={() => void create()} disabled={busy || !name.trim()} className="flex gap-2 items-center justify-center px-4 py-2.5 bg-burgundy text-cream rounded-lg disabled:opacity-40"><Plus size={15} />Agregar</button>
      </div>
    </div>
    {KINDS.map(group => <div key={group} className="bg-white rounded-2xl border border-border shadow-sm">
      <h2 className="font-sans font-bold p-4 border-b border-border">{KIND_LABELS[group]}</h2>
      <div className="divide-y divide-border/60">
        {categories.filter(category => category.kind === group).map(category => {
          const draft = drafts[category.id] ?? category.name
          return <div key={category.id} className={`p-3 flex flex-wrap gap-2 items-center ${category.active ? '' : 'opacity-60'}`}>
            <input value={draft} onChange={event => setDrafts(previous => ({ ...previous, [category.id]: event.target.value }))} className={`${field} flex-1 min-w-48`} />
            {draft.trim() !== category.name && <button onClick={() => void rename(category)} className="border rounded-lg px-3 py-2 text-xs text-burgundy">Guardar nombre</button>}
            {group === 'sueldos'
              ? <span className="text-xs text-warm-gray">Cada pago se asocia a un empleado</span>
              : <button onClick={() => void toggle(category)} className="border rounded-lg px-3 py-2 text-xs">{category.active ? 'Desactivar' : 'Activar'}</button>}
          </div>
        })}
      </div>
    </div>)}
  </div>
}
