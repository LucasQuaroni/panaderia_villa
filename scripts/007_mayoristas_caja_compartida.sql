-- Panadería Villa · Migración 007
-- Mayoristas estructurados y una única caja física compartida.
-- Ejecutar después de 006. Esta migración no borra los settings JSON: los
-- copia una vez para conservar los clientes y pagos creados antes de 007.

create table if not exists public.wholesale_customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  business_name text not null,
  contact_name text not null default '',
  tax_id text not null default '',
  phone text not null default '',
  address text not null default '',
  has_current_account boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wholesale_account_payments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references public.wholesale_customers(id),
  cash_session_id uuid references public.cash_sessions(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Efectivo', 'Transferencia')),
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists wholesale_payments_customer_idx on public.wholesale_account_payments(customer_id);

alter table public.sales add column if not exists sale_channel text not null default 'minorista'
  check (sale_channel in ('minorista', 'mayorista'));
alter table public.sales add column if not exists wholesale_customer_id uuid references public.wholesale_customers(id);
create index if not exists sales_wholesale_customer_idx on public.sales(wholesale_customer_id);

-- Importación idempotente desde los settings históricos.
insert into public.wholesale_customers (legacy_id, business_name, contact_name, tax_id, phone, address, has_current_account, active)
select x->>'id', coalesce(nullif(x->>'business_name',''), 'Comercio sin nombre'), coalesce(x->>'contact_name',''),
       coalesce(x->>'tax_id',''), coalesce(x->>'phone',''), coalesce(x->>'address',''),
       coalesce((x->>'has_current_account')::boolean, false), coalesce((x->>'active')::boolean, true)
from (
  select value::jsonb as data
  from public.site_content
  where key = 'wholesale_customers_v1'
) s cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.data) = 'array' then s.data else '[]'::jsonb end
) x
on conflict (legacy_id) do nothing;

-- Las ventas previas con marcador quedan relacionadas al cliente nuevo.
update public.sales sale
set sale_channel = 'mayorista', wholesale_customer_id = c.id
from public.sale_items item join public.wholesale_customers c on c.legacy_id = substring(item.description from '^__MAYORISTA__:(.*)$')
where item.sale_id = sale.id and item.description like '__MAYORISTA__:%';

insert into public.wholesale_account_payments (legacy_id, customer_id, amount, payment_method, received_at)
select p->>'id', c.id, (p->>'amount')::numeric,
       case when p->>'method' = 'Efectivo' then 'Efectivo' else 'Transferencia' end,
       coalesce((p->>'received_at')::timestamptz, now())
from (
  select value::jsonb as data
  from public.site_content
  where key = 'wholesale_account_payments_v1'
) s cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.data) = 'array' then s.data else '[]'::jsonb end
) p
join public.wholesale_customers c on c.legacy_id = p->>'customer_id'
on conflict (legacy_id) do nothing;

alter table public.wholesale_customers enable row level security;
alter table public.wholesale_account_payments enable row level security;

drop policy if exists wholesale_customers_read on public.wholesale_customers;
create policy wholesale_customers_read on public.wholesale_customers for select
  using (public.get_user_role() in ('admin', 'cashier'));
drop policy if exists wholesale_customers_admin_write on public.wholesale_customers;
create policy wholesale_customers_admin_write on public.wholesale_customers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists wholesale_payments_read on public.wholesale_account_payments;
create policy wholesale_payments_read on public.wholesale_account_payments for select
  using (public.get_user_role() in ('admin', 'cashier'));

-- Una caja física: cualquier usuario autenticado puede ver/cerrar la sesión
-- abierta, sin importar quién la abrió. Sigue habiendo una sola sesión abierta.
drop policy if exists cash_sessions_insert on public.cash_sessions;
drop policy if exists cash_sessions_select on public.cash_sessions;
drop policy if exists cash_sessions_update on public.cash_sessions;
create policy cash_sessions_insert on public.cash_sessions for insert
  with check (public.get_user_role() in ('admin', 'cashier') and opened_by = auth.uid());
create policy cash_sessions_select on public.cash_sessions for select
  using (public.get_user_role() in ('admin', 'cashier'));
create policy cash_sessions_update on public.cash_sessions for update
  using (public.get_user_role() in ('admin', 'cashier'))
  with check (public.get_user_role() in ('admin', 'cashier'));

-- Versiones anteriores permitían una caja abierta por usuario. Si quedaron
-- varias abiertas, se conserva la más reciente y se cierran las anteriores
-- antes de imponer la unicidad global.
with ranked_open_sessions as (
  select id, row_number() over (order by opened_at desc, id desc) as position
  from public.cash_sessions
  where status = 'open'
)
update public.cash_sessions
set status = 'closed', closed_at = coalesce(closed_at, now())
where id in (select id from ranked_open_sessions where position > 1);

create unique index if not exists one_open_cash_session on public.cash_sessions ((status)) where status = 'open';

drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select
  using (public.get_user_role() in ('admin', 'cashier'));
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select using (
  public.get_user_role() in ('admin', 'cashier')
  and exists (select 1 from public.sales s where s.id = sale_id)
);

create or replace function public.register_wholesale_sale(
  p_client_uuid uuid, p_cash_session_id uuid, p_payment_method text,
  p_customer_id uuid, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sale_id uuid; v_total numeric(12,2); v_item jsonb;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_payment_method not in ('Efectivo','Transferencia','Cuenta corriente') then raise exception 'Medio de pago inválido'; end if;
  if not exists (select 1 from cash_sessions where id=p_cash_session_id and status='open') then raise exception 'No hay una caja abierta válida'; end if;
  if not exists (select 1 from wholesale_customers where id=p_customer_id and active) then raise exception 'Cliente mayorista inválido o dado de baja'; end if;
  if p_payment_method='Cuenta corriente' and not exists (select 1 from wholesale_customers where id=p_customer_id and has_current_account) then raise exception 'El cliente no tiene cuenta corriente'; end if;
  select id into v_sale_id from sales where client_uuid=p_client_uuid; if v_sale_id is not null then return v_sale_id; end if;
  select coalesce(sum((x->>'subtotal')::numeric),0) into v_total from jsonb_array_elements(p_items) x;
  insert into sales(client_uuid,cash_session_id,sold_by,payment_method,total,sale_channel,wholesale_customer_id)
  values(p_client_uuid, p_cash_session_id, auth.uid(),p_payment_method,v_total,'mayorista',p_customer_id) returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into sale_items(sale_id,product_id,description,unit,quantity,stock_quantity,unit_price,subtotal)
    values(v_sale_id,nullif(v_item->>'product_id','')::uuid,coalesce(v_item->>'description','Producto'),coalesce(v_item->>'unit','unidad'),(v_item->>'quantity')::numeric,coalesce((v_item->>'stock_quantity')::numeric,(v_item->>'quantity')::numeric),(v_item->>'unit_price')::numeric,(v_item->>'subtotal')::numeric);
    if nullif(v_item->>'product_id','') is not null then insert into stock_movements(product_id,delta,reason,ref_type,ref_id,created_by) values((v_item->>'product_id')::uuid,-coalesce((v_item->>'stock_quantity')::numeric,(v_item->>'quantity')::numeric),'venta','sale',v_sale_id,auth.uid()); end if;
  end loop;
  return v_sale_id;
end $$;
grant execute on function public.register_wholesale_sale(uuid,uuid,text,uuid,jsonb) to authenticated;

create or replace function public.register_wholesale_payment(p_customer_id uuid,p_cash_session_id uuid,p_amount numeric,p_payment_method text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 if p_amount <= 0 or p_payment_method not in ('Efectivo','Transferencia') then raise exception 'Pago inválido'; end if;
 if not exists(select 1 from wholesale_customers where id=p_customer_id) then raise exception 'Cliente inválido'; end if;
 if p_payment_method='Efectivo' and not exists(select 1 from cash_sessions where id=p_cash_session_id and status='open') then raise exception 'Abrí la caja antes de registrar un cobro en efectivo'; end if;
 insert into wholesale_account_payments(customer_id,cash_session_id,amount,payment_method,received_by)
 values(p_customer_id,p_cash_session_id,p_amount,p_payment_method,auth.uid()) returning id into v_id;
 return v_id;
end $$;
grant execute on function public.register_wholesale_payment(uuid,uuid,numeric,text) to authenticated;
