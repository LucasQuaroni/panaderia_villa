-- ============================================================
-- Panadería Villa · Iteración 3-5 — Ventas, stock y caja
-- Migración 004  (requiere 002 ya aplicada: usa is_admin())
-- ============================================================
-- Crea el modelo de datos del punto de venta (POS):
--   · cash_sessions   → turnos de caja (apertura/cierre)
--   · sales           → cada venta (ticket)
--   · sale_items      → renglones de cada venta
--   · stock_movements → entradas/salidas de stock (el stock es su suma)
-- y la función register_sale() que registra una venta de forma
-- atómica e idempotente (segura para el modo offline).
-- ============================================================

-- ── 1. Caja ───────────────────────────────────────────────
create table if not exists public.cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  opened_by     uuid references auth.users(id),
  opened_at     timestamptz not null default now(),
  opening_float numeric(12,2) not null default 0,   -- fondo inicial
  status        text not null default 'open' check (status in ('open', 'closed')),
  closed_at     timestamptz,
  closed_by     uuid references auth.users(id),
  counted_cash  numeric(12,2),                        -- efectivo contado al cierre
  notes         text
);

-- ── 2. Ventas ─────────────────────────────────────────────
create table if not exists public.sales (
  id              uuid primary key default gen_random_uuid(),
  client_uuid     uuid not null unique,               -- idempotencia (evita duplicados al sincronizar)
  cash_session_id uuid references public.cash_sessions(id),
  sold_by         uuid references auth.users(id),
  sold_at         timestamptz not null default now(),
  payment_method  text,
  total           numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists sales_session_idx on public.sales(cash_session_id);
create index if not exists sales_sold_at_idx on public.sales(sold_at);

-- ── 3. Renglones de venta ─────────────────────────────────
create table if not exists public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid references public.products(id),
  description text not null,                           -- nombre "congelado" al momento de la venta
  unit        text not null default 'unidad',
  quantity    numeric(12,3) not null,                 -- kg o unidades
  unit_price  numeric(12,2) not null,
  subtotal    numeric(12,2) not null
);

create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

-- ── 4. Movimientos de stock ───────────────────────────────
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid references public.products(id),
  raw_material_id uuid references public.raw_materials(id),
  delta           numeric(12,3) not null,             -- negativo = salida, positivo = entrada
  reason          text not null,                      -- 'venta' | 'produccion' | 'compra' | 'ajuste' | 'merma'
  ref_type        text,
  ref_id          uuid,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists stock_mov_product_idx on public.stock_movements(product_id);

-- ── 5. RLS ────────────────────────────────────────────────
alter table public.cash_sessions  enable row level security;
alter table public.sales          enable row level security;
alter table public.sale_items     enable row level security;
alter table public.stock_movements enable row level security;

-- Caja: cada quien maneja las suyas; el admin ve todas.
drop policy if exists cash_sessions_insert on public.cash_sessions;
create policy cash_sessions_insert on public.cash_sessions
  for insert with check (opened_by = auth.uid());
drop policy if exists cash_sessions_select on public.cash_sessions;
create policy cash_sessions_select on public.cash_sessions
  for select using (opened_by = auth.uid() or public.is_admin());
drop policy if exists cash_sessions_update on public.cash_sessions;
create policy cash_sessions_update on public.cash_sessions
  for update using (opened_by = auth.uid() or public.is_admin())
  with check (opened_by = auth.uid() or public.is_admin());

-- Ventas: el cajero ve las propias; el admin ve todas.
-- (La escritura pasa por register_sale, que corre con privilegios.)
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select using (sold_by = auth.uid() or public.is_admin());

drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items
  for select using (exists (
    select 1 from public.sales s
    where s.id = sale_id and (s.sold_by = auth.uid() or public.is_admin())
  ));

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements
  for select using (public.is_admin());

-- ── 6. Función register_sale (atómica + idempotente) ──────
create or replace function public.register_sale(
  p_client_uuid     uuid,
  p_cash_session_id uuid,
  p_payment_method  text,
  p_items           jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total   numeric(12,2);
  v_item    jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Idempotencia: si esta venta ya se registró, devolver su id.
  select id into v_sale_id from public.sales where client_uuid = p_client_uuid;
  if v_sale_id is not null then
    return v_sale_id;
  end if;

  select coalesce(sum((it->>'subtotal')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_items) as it;

  insert into public.sales (client_uuid, cash_session_id, sold_by, payment_method, total)
  values (p_client_uuid, p_cash_session_id, auth.uid(), p_payment_method, v_total)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.sale_items (sale_id, product_id, description, unit, quantity, unit_price, subtotal)
    values (
      v_sale_id,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce(v_item->>'description', 'Producto'),
      coalesce(v_item->>'unit', 'unidad'),
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      (v_item->>'subtotal')::numeric
    );

    -- Descuento de stock del producto (si aplica).
    if nullif(v_item->>'product_id', '') is not null then
      insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
      values (
        (v_item->>'product_id')::uuid,
        -1 * (v_item->>'quantity')::numeric,
        'venta', 'sale', v_sale_id, auth.uid()
      );
    end if;
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.register_sale(uuid, uuid, text, jsonb) to authenticated;

-- ── 7. Función void_sale (anular una venta) ───────────────
-- Revierte el stock (movimientos compensatorios) y elimina la venta, así
-- deja de contar en el cierre de caja. Idempotente: si ya no existe, no hace nada.
create or replace function public.void_sale(p_client_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item    record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select id into v_sale_id from public.sales where client_uuid = p_client_uuid;
  if v_sale_id is null then
    return false;  -- ya no existe (o nunca se sincronizó)
  end if;

  -- Solo el vendedor o un admin pueden anular.
  if not exists (
    select 1 from public.sales s
    where s.id = v_sale_id and (s.sold_by = auth.uid() or public.is_admin())
  ) then
    raise exception 'No autorizado para anular esta venta';
  end if;

  -- Movimientos compensatorios (devuelven el stock).
  for v_item in
    select product_id, quantity from public.sale_items
    where sale_id = v_sale_id and product_id is not null
  loop
    insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
    values (v_item.product_id, v_item.quantity, 'anulacion', 'void', v_sale_id, auth.uid());
  end loop;

  delete from public.sales where id = v_sale_id;  -- borra también sale_items (cascade)
  return true;
end;
$$;

grant execute on function public.void_sale(uuid) to authenticated;

-- ============================================================
-- Notas:
-- · No bloquea vender si el stock queda negativo (prioridad: no frenar el cobro).
--   El stock negativo queda visible para revisión.
-- · El stock real de un producto = suma de sus stock_movements.
-- · register_sale es idempotente por client_uuid: reintentar una venta
--   (por ejemplo al sincronizar tras estar offline) NO la duplica.
-- ============================================================
