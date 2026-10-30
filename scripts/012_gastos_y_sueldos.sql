-- Panadería Villa · Migración 012
-- Gastos de la panadería por categoría, empleados con su sueldo y pagos de
-- sueldos. Los gastos personales de las dueñas son categorías propias.
-- Es un registro aparte: no modifica la caja, sus movimientos ni el cierre.
-- Solo el administrador puede verlo o cargarlo. Ejecutar después de 011.
begin;

create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- general: impuestos, proveedores, etc. · sueldos: pagos a empleados ·
  -- personal: gastos personales de una persona (una categoría por persona).
  kind text not null default 'general' check (kind in ('general', 'sueldos', 'personal')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists expense_categories_name_idx on public.expense_categories (lower(btrim(name)));
create unique index if not exists expense_categories_single_salary_idx on public.expense_categories (kind) where kind = 'sueldos';

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) > 0),
  position text not null default '',
  document text not null default '',
  phone text not null default '',
  start_date date,
  salary numeric(12,2) not null default 0 check (salary >= 0),
  pay_frequency text not null default 'Mensual' check (pay_frequency in ('Mensual', 'Quincenal', 'Semanal')),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category_id uuid not null references public.expense_categories(id),
  description text not null default '',
  payee text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Efectivo', 'Transferencia', 'Tarjeta', 'Otro')),
  employee_id uuid references public.employees(id),
  salary_period text not null default '',
  -- Anular conserva el registro: no se borra nada, solo deja de sumar.
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses(expense_date);
create index if not exists expenses_category_idx on public.expenses(category_id);
create index if not exists expenses_employee_idx on public.expenses(employee_id);

insert into public.expense_categories (name, kind) values
  ('Impuestos', 'general'),
  ('Proveedores', 'general'),
  ('Servicios (luz, gas, agua, internet)', 'general'),
  ('Alquiler', 'general'),
  ('Mantenimiento y reparaciones', 'general'),
  ('Otros gastos', 'general'),
  ('Sueldos', 'sueldos'),
  ('Vale', 'personal'),
  ('Estela', 'personal')
on conflict do nothing;

-- Un sueldo siempre tiene empleado; el resto de los gastos no.
create or replace function public.validate_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text; v_active boolean;
begin
  select kind, active into v_kind, v_active from public.expense_categories where id = new.category_id;
  if v_kind is null then raise exception 'Categoría de gasto inválida'; end if;
  if not v_active and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
    raise exception 'La categoría está desactivada';
  end if;
  if v_kind = 'sueldos' then
    if new.employee_id is null then raise exception 'Elegí el empleado al que corresponde el pago'; end if;
  else
    new.employee_id := null;
    new.salary_period := '';
  end if;
  new.description := btrim(new.description);
  new.payee := btrim(new.payee);
  new.salary_period := btrim(new.salary_period);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.voided_at is null then new.voided_by := null;
  elsif tg_op = 'INSERT' or old.voided_at is null then new.voided_by := auth.uid();
  else new.voided_by := old.voided_by; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists validate_expense on public.expenses;
create trigger validate_expense before insert or update on public.expenses
  for each row execute function public.validate_expense();

create or replace function public.touch_employee()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists touch_employee on public.employees;
create trigger touch_employee before update on public.employees
  for each row execute function public.touch_employee();

-- Solo administrador. Nada se borra: categorías y empleados se desactivan
-- y los gastos se anulan.
revoke all on public.expense_categories, public.employees, public.expenses from anon, authenticated;
grant select, insert, update on public.expense_categories, public.employees, public.expenses to authenticated;
revoke all on function public.validate_expense() from public, anon, authenticated;
revoke all on function public.touch_employee() from public, anon, authenticated;

alter table public.expense_categories enable row level security;
alter table public.employees enable row level security;
alter table public.expenses enable row level security;
drop policy if exists expense_categories_admin on public.expense_categories;
create policy expense_categories_admin on public.expense_categories for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists employees_admin on public.employees;
create policy employees_admin on public.employees for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses for all
  using (public.is_admin()) with check (public.is_admin());

commit;
