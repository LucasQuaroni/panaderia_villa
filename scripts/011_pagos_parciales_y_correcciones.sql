-- Pagos parciales, movimientos de caja y correcciones extraordinarias.
-- Ejecutar después de 010. Probar primero en una base aislada.
begin;

alter table public.sales add column if not exists revision integer not null default 0;
alter table public.retail_account_payments add column if not exists sale_id uuid references public.sales(id);
alter table public.wholesale_account_payments add column if not exists sale_id uuid references public.sales(id);
create unique index if not exists retail_initial_payment_sale_idx on public.retail_account_payments(sale_id) where sale_id is not null;
create unique index if not exists wholesale_initial_payment_sale_idx on public.wholesale_account_payments(sale_id) where sale_id is not null;

create table if not exists public.sale_corrections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  sale_id uuid not null references public.sales(id),
  corrected_at timestamptz not null default now(),
  corrected_by uuid not null references auth.users(id),
  reason text not null check (length(btrim(reason)) >= 5),
  before_data jsonb not null,
  after_data jsonb not null,
  cash_session_id uuid references public.cash_sessions(id)
);
create index if not exists sale_corrections_sale_idx on public.sale_corrections(sale_id);
-- Fija lo realmente cobrado en el turno original cuando ya se cerró.
create table if not exists public.sale_cash_baselines (
  sale_id uuid primary key references public.sales(id),
  cash_paid numeric(12,2) not null,
  transfer_paid numeric(12,2) not null
);
create table if not exists public.sale_cash_adjustments (
  id uuid primary key default gen_random_uuid(),
  correction_id uuid not null references public.sale_corrections(id),
  sale_id uuid not null references public.sales(id),
  cash_session_id uuid not null references public.cash_sessions(id),
  amount numeric(12,2) not null check (amount <> 0),
  payment_method text not null check (payment_method in ('Efectivo','Transferencia')),
  created_at timestamptz not null default now()
);
create index if not exists sale_adjustments_session_idx on public.sale_cash_adjustments(cash_session_id);
alter table public.sale_corrections enable row level security;
alter table public.sale_cash_baselines enable row level security;
alter table public.sale_cash_adjustments enable row level security;
create policy sale_corrections_read on public.sale_corrections for select using (public.is_admin());
create policy sale_baselines_read on public.sale_cash_baselines for select using (public.get_user_role() in ('admin','cashier'));
create policy sale_adjustments_read on public.sale_cash_adjustments for select using (public.get_user_role() in ('admin','cashier'));
revoke all on public.sale_corrections, public.sale_cash_baselines, public.sale_cash_adjustments from anon, authenticated;
grant select on public.sale_corrections, public.sale_cash_baselines, public.sale_cash_adjustments to authenticated;

create or replace view public.sale_payment_summary with (security_invoker = true) as
select s.id as sale_id, s.cash_session_id, s.sale_channel, s.payment_method, s.total,
  case when s.payment_method='Efectivo' then s.total else coalesce(p.cash_paid,0) end as cash_paid,
  case when s.payment_method='Transferencia' then s.total else coalesce(p.transfer_paid,0) end as transfer_paid,
  case when s.payment_method in ('Fiado','Cuenta corriente') then s.total-coalesce(p.cash_paid,0)-coalesce(p.transfer_paid,0) else 0 end as debt_amount
from public.sales s
left join (
 select sale_id, sum(case when payment_method='Efectivo' then amount else 0 end) as cash_paid,
   sum(case when payment_method='Transferencia' then amount else 0 end) as transfer_paid
 from (
  select sale_id,amount,payment_method from public.retail_account_payments where sale_id is not null
  union all
  select sale_id,amount,payment_method from public.wholesale_account_payments where sale_id is not null
 ) payments group by sale_id
) p on p.sale_id=s.id;
grant select on public.sale_payment_summary to authenticated;

-- Un solo origen para el cierre y su detalle. La deuda nunca es un ingreso.
create or replace view public.cash_movements with (security_invoker = true) as
select s.id::text || ':' || paid.method as id, s.cash_session_id, s.sold_at as occurred_at,
 'sale'::text as source, s.sale_channel, coalesce(w.business_name,r.name,'Cliente de mostrador') as customer_name,
 paid.method as payment_method, paid.amount, s.id as sale_id, 'Venta'::text as detail
from public.sales s
join public.sale_payment_summary summary on summary.sale_id=s.id
left join public.sale_cash_baselines baseline on baseline.sale_id=s.id
left join public.wholesale_customers w on w.id=s.wholesale_customer_id
left join public.retail_customers r on r.id=s.retail_customer_id
cross join lateral (values
 ('Efectivo'::text, coalesce(baseline.cash_paid,summary.cash_paid)),
 ('Transferencia'::text, coalesce(baseline.transfer_paid,summary.transfer_paid))
) paid(method,amount) where paid.amount <> 0
union all
select 'retail:' || p.id::text,p.cash_session_id,p.received_at,'account_payment','minorista',c.name,p.payment_method,p.amount,null::uuid,'Cobro de fiado'
from public.retail_account_payments p join public.retail_customers c on c.id=p.customer_id where p.sale_id is null
union all
select 'wholesale:' || p.id::text,p.cash_session_id,p.received_at,'account_payment','mayorista',c.business_name,p.payment_method,p.amount,null::uuid,'Cobro de cuenta mayorista'
from public.wholesale_account_payments p join public.wholesale_customers c on c.id=p.customer_id where p.sale_id is null
union all
select 'adjustment:' || a.id::text,a.cash_session_id,a.created_at,'correction',s.sale_channel,
 coalesce(w.business_name,r.name,'Cliente de mostrador'),a.payment_method,a.amount,s.id,'Corrección de venta'
from public.sale_cash_adjustments a join public.sales s on s.id=a.sale_id
left join public.wholesale_customers w on w.id=s.wholesale_customer_id
left join public.retail_customers r on r.id=s.retail_customer_id;
grant select on public.cash_movements to authenticated;

create or replace function public.register_partial_sale(
 p_client_uuid uuid,p_cash_session_id uuid,p_sale_channel text,p_customer_id uuid,
 p_items jsonb,p_paid_amount numeric,p_paid_method text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_sale_id uuid; v_total numeric(12,2);
begin
 if coalesce(public.get_user_role(),'') not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_client_uuid is null then raise exception 'Operación inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_uuid::text,0));
 select id into v_sale_id from public.sales where client_uuid=p_client_uuid;
 if v_sale_id is not null then return v_sale_id; end if;
 if p_sale_channel is null or p_sale_channel not in ('minorista','mayorista') or p_paid_method is null or p_paid_method not in ('Efectivo','Transferencia') then raise exception 'Tipo de venta o pago inválido'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'El carrito está vacío'; end if;
 select sum((item->>'subtotal')::numeric) into v_total from jsonb_array_elements(p_items) item;
 if p_paid_amount is null or not (p_paid_amount>0 and p_paid_amount<v_total and p_paid_amount<10000000000 and p_paid_amount=round(p_paid_amount,2)) then raise exception 'El abono debe ser mayor que cero y menor al total'; end if;
 perform pg_advisory_xact_lock(7030421);
 if p_sale_channel='minorista' then perform 1 from public.retail_customers where id=p_customer_id for update;
 else perform 1 from public.wholesale_customers where id=p_customer_id for update; end if;
 if not found then raise exception 'Seleccioná un cliente válido'; end if;
 perform 1 from public.cash_sessions where id=p_cash_session_id and status='open' for share;
 if not found then raise exception 'Abrí la caja antes de registrar el abono'; end if;
 -- Comprueba también las cantidades mayoristas (la función anterior no lo hacía).
 if exists(select 1 from jsonb_array_elements(p_items) x where
  not (coalesce((x->>'quantity')::numeric,0)>0 and (x->>'quantity')::numeric<1000000000
   and coalesce((x->>'stock_quantity')::numeric,(x->>'quantity')::numeric,0)>0 and coalesce((x->>'stock_quantity')::numeric,(x->>'quantity')::numeric)<1000000000
   and coalesce((x->>'unit_price')::numeric,-1)>=0 and (x->>'unit_price')::numeric<10000000000
   and coalesce((x->>'subtotal')::numeric,-1)>=0 and (x->>'subtotal')::numeric<10000000000)) then raise exception 'Hay cantidades o precios inválidos'; end if;
 if p_sale_channel='minorista' then
  v_sale_id:=public.register_fiado_sale(p_client_uuid,p_cash_session_id,p_customer_id,p_items);
  insert into public.retail_account_payments(customer_id,cash_session_id,amount,payment_method,received_by,sale_id)
  values(p_customer_id,p_cash_session_id,p_paid_amount,p_paid_method,auth.uid(),v_sale_id);
 else
  v_sale_id:=public.register_wholesale_sale(p_client_uuid,p_cash_session_id,'Cuenta corriente',p_customer_id,p_items);
  insert into public.wholesale_account_payments(customer_id,cash_session_id,amount,payment_method,received_by,sale_id)
  values(p_customer_id,p_cash_session_id,p_paid_amount,p_paid_method,auth.uid(),v_sale_id);
 end if;
 return v_sale_id;
end $$;
revoke all on function public.register_partial_sale(uuid,uuid,text,uuid,jsonb,numeric,text) from public, anon;
grant execute on function public.register_partial_sale(uuid,uuid,text,uuid,jsonb,numeric,text) to authenticated;

-- No se anulan por el atajo ventas con abonos o correcciones auditadas.
create or replace function public.guard_account_sale_void()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.retail_account_payments where sale_id=old.id)
 or exists(select 1 from public.wholesale_account_payments where sale_id=old.id)
 or exists(select 1 from public.sale_corrections where sale_id=old.id) then
  raise exception 'Esta venta tiene abonos o correcciones. Usá la edición extraordinaria del administrador';
 end if;
 perform 1 from public.cash_sessions where id=old.cash_session_id and status='open' for share;
 if not found then
  raise exception 'La caja de esta venta ya cerró. Usá la edición extraordinaria del administrador';
 end if;
 return old;
end $$;
create trigger guard_account_sale_void before delete on public.sales for each row execute function public.guard_account_sale_void();

-- La corrección rápida solo se usa en ventas normales de una caja abierta.
create or replace function public.change_sale_payment_method(p_client_uuid uuid,p_payment_method text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_sale public.sales%rowtype; v_total numeric(12,2);
begin
 if coalesce(public.get_user_role(),'') not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_payment_method is null or p_payment_method not in ('Efectivo','Transferencia','Consumo interno') then raise exception 'Medio de pago inválido'; end if;
 select * into v_sale from public.sales where client_uuid=p_client_uuid and (sold_by=auth.uid() or public.is_admin()) for update;
 if not found then return false; end if;
 if v_sale.payment_method in ('Fiado','Cuenta corriente') or exists(select 1 from public.sale_corrections where sale_id=v_sale.id) then raise exception 'Usá la edición extraordinaria del administrador'; end if;
 perform 1 from public.cash_sessions where id=v_sale.cash_session_id and status='open' for share;
 if not found then raise exception 'La caja ya cerró. Usá la edición extraordinaria'; end if;
 select case when p_payment_method='Consumo interno' then 0 else coalesce(sum(subtotal),0) end into v_total from public.sale_items where sale_id=v_sale.id;
 update public.sales set payment_method=p_payment_method,total=v_total,revision=revision+1 where id=v_sale.id;
 update public.stock_movements set reason=case when p_payment_method='Consumo interno' then 'consumo_interno' else 'venta' end where ref_type='sale' and ref_id=v_sale.id;
 return true;
end $$;
revoke all on function public.change_sale_payment_method(uuid,text) from public, anon;
grant execute on function public.change_sale_payment_method(uuid,text) to authenticated;

-- Solo administrador; guarda antes/después y mueve únicamente la diferencia.
create or replace function public.correct_sale(
 p_request_id uuid,p_sale_id uuid,p_expected_revision integer,p_items jsonb,
 p_payment_method text,p_initial_paid numeric,p_initial_method text,p_reason text,p_adjustment_session_id uuid,p_retail_customer_id uuid
) returns integer language plpgsql security definer set search_path=public as $$
declare
 v_sale public.sales%rowtype; v_total numeric(12,2); v_item jsonb; v_before_items jsonb;
 v_before jsonb; v_after jsonb; v_correction_id uuid:=gen_random_uuid(); v_session_status text;
 v_cash_before numeric(12,2); v_transfer_before numeric(12,2); v_cash_after numeric(12,2); v_transfer_after numeric(12,2);
 v_balance_before numeric(12,2); v_balance_after numeric(12,2); v_customer_id uuid; v_correction_session uuid; v_delta record;
begin
 if not coalesce(public.is_admin(),false) then raise exception 'Solo el administrador puede hacer una edición extraordinaria'; end if;
 if p_request_id is null then raise exception 'Operación inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 if exists(select 1 from public.sale_corrections where request_id=p_request_id) then
  if not exists(select 1 from public.sale_corrections where request_id=p_request_id and sale_id=p_sale_id) then raise exception 'Operación inválida'; end if;
  return (select revision from public.sales where id=p_sale_id);
 end if;
 if p_reason is null or length(btrim(p_reason))<5 then raise exception 'Explicá el motivo de la corrección (al menos 5 caracteres)'; end if;
 perform pg_advisory_xact_lock(7030421);
 select * into v_sale from public.sales where id=p_sale_id for update;
 if not found then raise exception 'La venta ya no existe'; end if;
 if p_expected_revision is distinct from v_sale.revision then raise exception 'La venta cambió. Volvé a cargarla antes de corregir'; end if;
 v_customer_id:=coalesce(v_sale.retail_customer_id,p_retail_customer_id);
 if v_sale.retail_customer_id is not null and p_retail_customer_id is not null and v_sale.retail_customer_id<>p_retail_customer_id then raise exception 'No se puede reasignar una cuenta con historial a otro cliente'; end if;
 if p_payment_method is null or p_payment_method not in ('Efectivo','Transferencia','Fiado','Cuenta corriente','Consumo interno')
 or (p_payment_method='Fiado' and (v_sale.sale_channel<>'minorista' or v_customer_id is null))
 or (p_payment_method='Cuenta corriente' and (v_sale.sale_channel<>'mayorista' or v_sale.wholesale_customer_id is null)) then raise exception 'Medio de pago inválido para esta venta'; end if;
 if v_sale.sale_channel='minorista' and v_customer_id is not null then
  perform 1 from public.retail_customers where id=v_customer_id for update;
  if not found then raise exception 'Cliente de fiado inválido'; end if;
  select balance into v_balance_before from public.retail_account_balances where id=v_customer_id;
 elsif v_sale.wholesale_customer_id is not null then
  perform 1 from public.wholesale_customers where id=v_sale.wholesale_customer_id for update;
  select balance into v_balance_before from public.wholesale_account_balances where id=v_sale.wholesale_customer_id;
 end if;
 select status into v_session_status from public.cash_sessions where id=v_sale.cash_session_id for share;
 if v_session_status is null then raise exception 'La venta no tiene una caja válida'; end if;
 select cash_paid,transfer_paid into v_cash_before,v_transfer_before from public.sale_payment_summary where sale_id=v_sale.id;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) into v_before_items from public.sale_items i where sale_id=v_sale.id;
 v_before:=jsonb_build_object('sale',to_jsonb(v_sale),'items',v_before_items,'cash_paid',v_cash_before,'transfer_paid',v_transfer_before);
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Agregá al menos un producto'; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if not (coalesce((v_item->>'quantity')::numeric,0)>0 and (v_item->>'quantity')::numeric<1000000000
   and (v_item->>'quantity')::numeric=round((v_item->>'quantity')::numeric,3)
   and coalesce((v_item->>'unit_price')::numeric,-1)>=0 and (v_item->>'unit_price')::numeric<10000000000
   and (v_item->>'unit_price')::numeric=round((v_item->>'unit_price')::numeric,2)
   and coalesce((v_item->>'subtotal')::numeric,-1)>=0 and (v_item->>'subtotal')::numeric<10000000000
   and (v_item->>'subtotal')::numeric=round((v_item->>'subtotal')::numeric,2)
   and coalesce((v_item->>'stock_quantity')::numeric,0)>0 and (v_item->>'stock_quantity')::numeric<1000000000
   and (v_item->>'stock_quantity')::numeric=round((v_item->>'stock_quantity')::numeric,3))
  or length(btrim(coalesce(v_item->>'description','')))=0 then raise exception 'Hay cantidades, precios o productos inválidos'; end if;
 end loop;
 select sum((item->>'subtotal')::numeric) into v_total from jsonb_array_elements(p_items) item;
 if p_payment_method='Consumo interno' then v_total:=0; end if;
 if p_initial_paid is null or not (p_initial_paid>=0 and p_initial_paid<10000000000 and p_initial_paid=round(p_initial_paid,2)) then raise exception 'Abono inválido'; end if;
 if p_payment_method in ('Fiado','Cuenta corriente') then
  if v_total<=0 or p_initial_paid>=v_total then raise exception 'El abono debe ser menor al total de la venta a cuenta'; end if;
  if p_initial_paid>0 and (p_initial_method is null or p_initial_method not in ('Efectivo','Transferencia')) then raise exception 'Medio del abono inválido'; end if;
 elsif p_initial_paid<>0 then raise exception 'Solo una venta a cuenta admite abono inicial'; end if;

 -- La caja original se conserva. Los ajustes monetarios de ventas cerradas
 -- se imputan al turno abierto y se informan antes de confirmar en pantalla.
 if v_session_status='closed' then
  perform 1 from public.cash_sessions where id=p_adjustment_session_id and status='open' for share;
  if not found then raise exception 'Abrí la caja actual para registrar la corrección de un turno cerrado'; end if;
  v_correction_session:=p_adjustment_session_id;
  insert into public.sale_cash_baselines(sale_id,cash_paid,transfer_paid) values(v_sale.id,v_cash_before,v_transfer_before) on conflict(sale_id) do nothing;
 else v_correction_session:=v_sale.cash_session_id; end if;

 update public.sales set total=v_total,payment_method=p_payment_method,retail_customer_id=case when sale_channel='minorista' then v_customer_id else retail_customer_id end,revision=revision+1 where id=v_sale.id;
 delete from public.sale_items where sale_id=v_sale.id;
 for v_item in select * from jsonb_array_elements(p_items) loop
  insert into public.sale_items(sale_id,product_id,description,unit,quantity,stock_quantity,unit_price,subtotal)
  values(v_sale.id,nullif(v_item->>'product_id','')::uuid,v_item->>'description',coalesce(v_item->>'unit','unidad'),
   (v_item->>'quantity')::numeric,(v_item->>'stock_quantity')::numeric,(v_item->>'unit_price')::numeric,(v_item->>'subtotal')::numeric);
 end loop;
 if p_payment_method='Fiado' and p_initial_paid>0 then
  insert into public.retail_account_payments(customer_id,cash_session_id,amount,payment_method,received_by,sale_id,received_at)
  values(v_customer_id,v_sale.cash_session_id,p_initial_paid,p_initial_method,auth.uid(),v_sale.id,v_sale.sold_at)
  on conflict(sale_id) where sale_id is not null do update set amount=excluded.amount,payment_method=excluded.payment_method;
 else delete from public.retail_account_payments where sale_id=v_sale.id; end if;
 if p_payment_method='Cuenta corriente' and p_initial_paid>0 then
  insert into public.wholesale_account_payments(customer_id,cash_session_id,amount,payment_method,received_by,sale_id,received_at)
  values(v_sale.wholesale_customer_id,v_sale.cash_session_id,p_initial_paid,p_initial_method,auth.uid(),v_sale.id,v_sale.sold_at)
  on conflict(sale_id) where sale_id is not null do update set amount=excluded.amount,payment_method=excluded.payment_method;
 else delete from public.wholesale_account_payments where sale_id=v_sale.id; end if;
 if v_sale.sale_channel='minorista' and v_customer_id is not null then select balance into v_balance_after from public.retail_account_balances where id=v_customer_id;
 elsif v_sale.wholesale_customer_id is not null then select balance into v_balance_after from public.wholesale_account_balances where id=v_sale.wholesale_customer_id; end if;
 if v_balance_after<least(coalesce(v_balance_before,0),0) then raise exception 'La corrección dejaría cobros de cuenta sin deuda que los respalde. Revisá los pagos del cliente'; end if;

 -- Conserva movimientos históricos y compensa la diferencia de stock.
 for v_delta in
  with old_stock as (select (i->>'product_id')::uuid as product_id,sum(coalesce((i->>'stock_quantity')::numeric,(i->>'quantity')::numeric)) as quantity from jsonb_array_elements(v_before_items) i where nullif(i->>'product_id','') is not null group by 1),
  new_stock as (select product_id,sum(stock_quantity) as quantity from public.sale_items where sale_id=v_sale.id and product_id is not null group by 1)
  select coalesce(o.product_id,n.product_id) as product_id,coalesce(o.quantity,0)-coalesce(n.quantity,0) as delta from old_stock o full join new_stock n using(product_id)
 loop
  if v_delta.delta<>0 then insert into public.stock_movements(product_id,delta,reason,ref_type,ref_id,created_by)
   values(v_delta.product_id,v_delta.delta,'correccion_venta','sale_correction',v_correction_id,auth.uid()); end if;
 end loop;
 select cash_paid,transfer_paid into v_cash_after,v_transfer_after from public.sale_payment_summary where sale_id=v_sale.id;
 select jsonb_build_object('sale',to_jsonb(s),'items',(select jsonb_agg(to_jsonb(i) order by i.id) from public.sale_items i where sale_id=s.id),'cash_paid',v_cash_after,'transfer_paid',v_transfer_after)
 into v_after from public.sales s where s.id=v_sale.id;
 insert into public.sale_corrections(id,request_id,sale_id,corrected_by,reason,before_data,after_data,cash_session_id)
 values(v_correction_id,p_request_id,v_sale.id,auth.uid(),btrim(p_reason),v_before,v_after,v_correction_session);
 if v_session_status='closed' then
  if v_cash_after<>v_cash_before then insert into public.sale_cash_adjustments(correction_id,sale_id,cash_session_id,amount,payment_method)
   values(v_correction_id,v_sale.id,v_correction_session,v_cash_after-v_cash_before,'Efectivo'); end if;
  if v_transfer_after<>v_transfer_before then insert into public.sale_cash_adjustments(correction_id,sale_id,cash_session_id,amount,payment_method)
   values(v_correction_id,v_sale.id,v_correction_session,v_transfer_after-v_transfer_before,'Transferencia'); end if;
 end if;
 return v_sale.revision+1;
end $$;
revoke all on function public.correct_sale(uuid,uuid,integer,jsonb,text,numeric,text,text,uuid,uuid) from public, anon;
grant execute on function public.correct_sale(uuid,uuid,integer,jsonb,text,numeric,text,text,uuid,uuid) to authenticated;

-- Todos los ingresos se coordinan con el cierre de su sesión de caja.
create or replace function public.lock_sale_cash_session()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from public.cash_sessions where id=new.cash_session_id and status='open' for share;
 if not found then raise exception 'La caja ya cerró. Actualizá antes de registrar la venta'; end if;
 return new;
end $$;
create trigger lock_sale_cash_session before insert on public.sales for each row execute function public.lock_sale_cash_session();

create or replace function public.register_retail_payment(p_customer_id uuid,p_cash_session_id uuid,p_amount numeric,p_payment_method text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_balance numeric(12,2); v_id uuid;
begin
 if coalesce(public.get_user_role(),'') not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_amount is null or not(p_amount>0 and p_amount<10000000000 and p_amount=round(p_amount,2)) or p_payment_method is null or p_payment_method not in ('Efectivo','Transferencia') then raise exception 'Pago inválido'; end if;
 perform 1 from public.retail_customers where id=p_customer_id for update;
 if not found then raise exception 'Cliente inválido'; end if;
 perform 1 from public.cash_sessions where id=p_cash_session_id and status='open' for share;
 if not found then raise exception 'Abrí la caja antes de registrar el cobro'; end if;
 select balance into v_balance from public.retail_account_balances where id=p_customer_id;
 if p_amount>v_balance then raise exception 'El cobro supera el saldo pendiente'; end if;
 insert into public.retail_account_payments(customer_id,cash_session_id,amount,payment_method,received_by)
 values(p_customer_id,p_cash_session_id,p_amount,p_payment_method,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.register_retail_payment(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.register_retail_payment(uuid,uuid,numeric,text) to authenticated;

create or replace function public.register_wholesale_payment(p_customer_id uuid,p_cash_session_id uuid,p_amount numeric,p_payment_method text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_balance numeric(12,2); v_id uuid;
begin
 if coalesce(public.get_user_role(),'') not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_amount is null or not(p_amount>0 and p_amount<10000000000 and p_amount=round(p_amount,2)) or p_payment_method is null or p_payment_method not in ('Efectivo','Transferencia') then raise exception 'Pago inválido'; end if;
 perform 1 from public.wholesale_customers where id=p_customer_id for update;
 if not found then raise exception 'Cliente inválido'; end if;
 perform 1 from public.cash_sessions where id=p_cash_session_id and status='open' for share;
 if not found then raise exception 'Abrí la caja antes de registrar el cobro'; end if;
 select balance into v_balance from public.wholesale_account_balances where id=p_customer_id;
 if p_amount>v_balance then raise exception 'El cobro supera el saldo pendiente'; end if;
 insert into public.wholesale_account_payments(customer_id,cash_session_id,amount,payment_method,received_by)
 values(p_customer_id,p_cash_session_id,p_amount,p_payment_method,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.register_wholesale_payment(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.register_wholesale_payment(uuid,uuid,numeric,text) to authenticated;

create or replace function public.close_cash_session(p_session_id uuid,p_expected_cash numeric,p_counted_cash numeric,p_shift text,p_reserve numeric)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_float numeric(12,2); v_expected numeric(12,2);
begin
 if coalesce(public.get_user_role(),'') not in ('admin','cashier') then raise exception 'No autorizado'; end if;
 if p_counted_cash is null or not(p_counted_cash>=0 and p_counted_cash<10000000000 and p_counted_cash=round(p_counted_cash,2))
 or p_reserve is null or not(p_reserve>=0 and p_reserve<10000000000 and p_reserve=round(p_reserve,2))
 or p_shift is null or p_shift not in ('mediodia','noche') then raise exception 'Datos de cierre inválidos'; end if;
 select opening_float into v_float from public.cash_sessions where id=p_session_id and status='open' for update;
 if not found then raise exception 'La caja ya fue cerrada. Actualizá la pantalla'; end if;
 select v_float+coalesce(sum(amount),0) into v_expected from public.cash_movements where cash_session_id=p_session_id and payment_method='Efectivo';
 if p_expected_cash is distinct from v_expected then raise exception 'Los movimientos de caja cambiaron. Volvé a abrir el cierre para revisar los totales'; end if;
 update public.cash_sessions set status='closed',closed_at=now(),closed_by=auth.uid(),counted_cash=p_counted_cash,
 notes=jsonb_build_object('closing_shift',p_shift,'cash_left',p_reserve,'cash_withdrawn',greatest(0,p_counted_cash-p_reserve))::text where id=p_session_id;
 return true;
end $$;
revoke all on function public.close_cash_session(uuid,numeric,numeric,text,numeric) from public, anon;
grant execute on function public.close_cash_session(uuid,numeric,numeric,text,numeric) to authenticated;
-- El cierre debe pasar por la comprobación atómica anterior.
drop policy if exists cash_sessions_update on public.cash_sessions;

commit;
