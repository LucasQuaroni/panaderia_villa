-- Fiados minoristas y permisos de atención. Ejecutar después de 009.

create table if not exists public.retail_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.sales add column if not exists retail_customer_id uuid references public.retail_customers(id);
create index if not exists sales_retail_customer_idx on public.sales(retail_customer_id);
alter table public.sales add constraint fiado_requires_customer
  check (payment_method is distinct from 'Fiado' or retail_customer_id is not null);

create table if not exists public.retail_account_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.retail_customers(id),
  cash_session_id uuid references public.cash_sessions(id),
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Efectivo', 'Transferencia')),
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id)
);
create index if not exists retail_payments_customer_idx on public.retail_account_payments(customer_id);
create index if not exists retail_payments_session_idx on public.retail_account_payments(cash_session_id);

revoke all on public.retail_customers, public.retail_account_payments from anon;
grant select, insert, update on public.retail_customers to authenticated;
grant select on public.retail_account_payments to authenticated;

alter table public.retail_customers enable row level security;
alter table public.retail_account_payments enable row level security;
create policy retail_customers_read on public.retail_customers for select
  using (public.get_user_role() in ('admin', 'cashier'));
create policy retail_customers_insert on public.retail_customers for insert
  with check (public.get_user_role() in ('admin', 'cashier'));
create policy retail_customers_admin_update on public.retail_customers for update
  using (public.is_admin()) with check (public.is_admin());
create policy retail_payments_read on public.retail_account_payments for select
  using (public.get_user_role() in ('admin', 'cashier'));

create or replace view public.retail_account_balances with (security_invoker = true) as
select customer.id, customer.name, customer.phone, customer.active,
  coalesce(sales_total.amount,0) as fiado_total,
  coalesce(payment_total.amount,0) as paid_total,
  coalesce(sales_total.amount,0) - coalesce(payment_total.amount,0) as balance
from public.retail_customers customer
left join (
  select retail_customer_id, sum(total) as amount from public.sales
  where payment_method = 'Fiado' group by retail_customer_id
) sales_total on sales_total.retail_customer_id = customer.id
left join (
  select customer_id, sum(amount) as amount from public.retail_account_payments group by customer_id
) payment_total on payment_total.customer_id = customer.id;
grant select on public.retail_account_balances to authenticated;

-- Atención puede agregar comercios, pero no cambiar ni dar de baja los existentes.
create policy wholesale_customers_cashier_insert on public.wholesale_customers for insert
  with check (public.get_user_role() = 'cashier');

create or replace view public.wholesale_account_balances with (security_invoker = true) as
select customer.id,
  coalesce(sales_total.amount,0) as account_sales,
  coalesce(payment_total.amount,0) as account_payments,
  coalesce(sales_total.amount,0) - coalesce(payment_total.amount,0) as balance
from public.wholesale_customers customer
left join (
  select wholesale_customer_id, sum(total) as amount from public.sales
  where payment_method = 'Cuenta corriente' group by wholesale_customer_id
) sales_total on sales_total.wholesale_customer_id = customer.id
left join (
  select customer_id, sum(amount) as amount from public.wholesale_account_payments group by customer_id
) payment_total on payment_total.customer_id = customer.id;
grant select on public.wholesale_account_balances to authenticated;

create or replace function public.register_fiado_sale(
  p_client_uuid uuid, p_cash_session_id uuid, p_customer_id uuid, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_sale_id uuid; v_total numeric(12,2); v_item jsonb;
begin
  if public.get_user_role() not in ('admin', 'cashier') then raise exception 'No autorizado'; end if;
  select id into v_sale_id from public.sales where client_uuid = p_client_uuid;
  if v_sale_id is not null then return v_sale_id; end if;
  if not exists (select 1 from public.cash_sessions where id = p_cash_session_id and status = 'open') then
    raise exception 'Abrí la caja antes de registrar el fiado';
  end if;
  if not exists (select 1 from public.retail_customers where id = p_customer_id and active) then
    raise exception 'Seleccioná un cliente de fiado activo';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  select coalesce(sum((item->>'subtotal')::numeric), 0) into v_total
  from jsonb_array_elements(p_items) item;
  if v_total <= 0 then raise exception 'El total del fiado debe ser positivo'; end if;

  insert into public.sales (client_uuid, cash_session_id, sold_by, payment_method, total, sale_channel, retail_customer_id)
  values (p_client_uuid, p_cash_session_id, auth.uid(), 'Fiado', v_total, 'minorista', p_customer_id)
  returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if (v_item->>'quantity')::numeric <= 0
       or coalesce((v_item->>'stock_quantity')::numeric,(v_item->>'quantity')::numeric) <= 0
       or (v_item->>'unit_price')::numeric < 0
       or (v_item->>'subtotal')::numeric < 0 then
      raise exception 'Hay un producto con cantidad o precio inválido';
    end if;
    insert into public.sale_items (sale_id, product_id, description, unit, quantity, stock_quantity, unit_price, subtotal)
    values (v_sale_id, nullif(v_item->>'product_id','')::uuid,
      coalesce(v_item->>'description','Producto'), coalesce(v_item->>'unit','unidad'),
      (v_item->>'quantity')::numeric,
      coalesce((v_item->>'stock_quantity')::numeric,(v_item->>'quantity')::numeric),
      (v_item->>'unit_price')::numeric, (v_item->>'subtotal')::numeric);
    if nullif(v_item->>'product_id','') is not null then
      insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
      values ((v_item->>'product_id')::uuid,
        -coalesce((v_item->>'stock_quantity')::numeric,(v_item->>'quantity')::numeric),
        'venta', 'sale', v_sale_id, auth.uid());
    end if;
  end loop;
  return v_sale_id;
end $$;
revoke all on function public.register_fiado_sale(uuid,uuid,uuid,jsonb) from public;
grant execute on function public.register_fiado_sale(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.register_retail_payment(
  p_customer_id uuid, p_cash_session_id uuid, p_amount numeric, p_payment_method text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_balance numeric(12,2); v_id uuid;
begin
  if public.get_user_role() not in ('admin', 'cashier') then raise exception 'No autorizado'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_payment_method not in ('Efectivo','Transferencia') then
    raise exception 'Pago inválido';
  end if;
  -- Bloquea los cobros simultáneos del mismo cliente antes de comprobar el saldo.
  perform 1 from public.retail_customers where id = p_customer_id for update;
  if not found then raise exception 'Cliente inválido'; end if;
  if not exists (select 1 from public.cash_sessions where id = p_cash_session_id and status = 'open') then
    raise exception 'Abrí la caja antes de registrar el cobro';
  end if;
  select coalesce((select sum(total) from public.sales where retail_customer_id = p_customer_id and payment_method = 'Fiado'),0)
       - coalesce((select sum(amount) from public.retail_account_payments where customer_id = p_customer_id),0)
  into v_balance;
  if p_amount > v_balance then raise exception 'El cobro supera el saldo pendiente'; end if;
  insert into public.retail_account_payments(customer_id,cash_session_id,amount,payment_method,received_by)
  values(p_customer_id,p_cash_session_id,p_amount,p_payment_method,auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.register_retail_payment(uuid,uuid,numeric,text) from public;
grant execute on function public.register_retail_payment(uuid,uuid,numeric,text) to authenticated;

-- No permite anular una venta cuyo importe ya se cobró en la cuenta.
create or replace function public.check_fiado_void_balance()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_other_sales numeric(12,2); v_payments numeric(12,2);
begin
  if old.payment_method <> 'Fiado' then return old; end if;
  perform 1 from public.retail_customers where id = old.retail_customer_id for update;
  select coalesce(sum(total),0) into v_other_sales from public.sales
  where retail_customer_id = old.retail_customer_id and payment_method = 'Fiado' and id <> old.id;
  select coalesce(sum(amount),0) into v_payments from public.retail_account_payments
  where customer_id = old.retail_customer_id;
  if v_payments > v_other_sales then
    raise exception 'Este fiado ya tiene cobros aplicados. Revisá la cuenta antes de anular la venta';
  end if;
  return old;
end $$;
drop trigger if exists check_fiado_void_balance on public.sales;
create trigger check_fiado_void_balance before delete on public.sales
for each row execute function public.check_fiado_void_balance();

-- Un fiado conserva su vínculo al cliente. Para corregirlo se anula la venta.
create or replace function public.change_sale_payment_method(p_client_uuid uuid, p_payment_method text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_sale_id uuid; v_total numeric(12,2); v_method text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if p_payment_method not in ('Efectivo','Transferencia','Consumo interno') then
    raise exception 'Medio de pago inválido';
  end if;
  select id, payment_method into v_sale_id, v_method from public.sales
  where client_uuid = p_client_uuid and (sold_by = auth.uid() or public.is_admin());
  if v_sale_id is null then return false; end if;
  if v_method = 'Fiado' then raise exception 'Anulá el fiado para corregirlo'; end if;
  if p_payment_method = 'Consumo interno' then v_total := 0;
  else select coalesce(sum(subtotal),0) into v_total from public.sale_items where sale_id = v_sale_id; end if;
  update public.sales set payment_method = p_payment_method, total = v_total where id = v_sale_id;
  update public.stock_movements
  set reason = case when p_payment_method = 'Consumo interno' then 'consumo_interno' else 'venta' end
  where ref_type = 'sale' and ref_id = v_sale_id;
  return true;
end $$;

-- Los cobros mayoristas desde atención quedan acotados a roles del local.
create or replace function public.register_wholesale_payment(p_customer_id uuid,p_cash_session_id uuid,p_amount numeric,p_payment_method text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_balance numeric(12,2);
begin
 if public.get_user_role() not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) or p_payment_method not in ('Efectivo','Transferencia') then raise exception 'Pago inválido'; end if;
 perform 1 from public.wholesale_customers where id=p_customer_id for update;
 if not found then raise exception 'Cliente inválido'; end if;
 if not exists(select 1 from public.cash_sessions where id=p_cash_session_id and status='open') then raise exception 'Abrí la caja antes de registrar un cobro'; end if;
 select coalesce((select sum(total) from public.sales where wholesale_customer_id=p_customer_id and payment_method='Cuenta corriente'),0)
      - coalesce((select sum(amount) from public.wholesale_account_payments where customer_id=p_customer_id),0)
 into v_balance;
 if p_amount > v_balance then raise exception 'El cobro supera el saldo pendiente'; end if;
 insert into public.wholesale_account_payments(customer_id,cash_session_id,amount,payment_method,received_by)
 values(p_customer_id,p_cash_session_id,p_amount,p_payment_method,auth.uid()) returning id into v_id;
 return v_id;
end $$;
