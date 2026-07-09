-- ============================================================
-- Panadería Villa · Iteración 6 — Control de stock
-- Migración 005  (requiere 002 y 004)
-- ============================================================
-- El stock (de insumos y de productos) es la SUMA de sus
-- movimientos en stock_movements. Acá agregamos:
--   · umbral de stock bajo (min_stock)
--   · tandas de producción (production_batches) + función register_production
--   · permiso de admin para registrar compras/ajustes/mermas
--   · vistas para consultar el stock actual
-- ============================================================

-- ── 1. Umbral de stock bajo ───────────────────────────────
alter table public.raw_materials add column if not exists min_stock numeric(12,3);
alter table public.products      add column if not exists min_stock numeric(12,3);

-- ── 2. Tandas de producción ───────────────────────────────
create table if not exists public.production_batches (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references public.products(id),
  produced_qty numeric(12,3) not null,
  produced_by  uuid references auth.users(id),
  produced_at  timestamptz not null default now(),
  notes        text
);

alter table public.production_batches enable row level security;
drop policy if exists production_admin_all on public.production_batches;
create policy production_admin_all on public.production_batches
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 3. Compras / ajustes / mermas (movimientos directos) ──
-- El admin puede insertar movimientos (entrada de compra, ajuste, merma).
drop policy if exists stock_movements_admin_insert on public.stock_movements;
create policy stock_movements_admin_insert on public.stock_movements
  for insert with check (public.is_admin());

-- ── 4. Función register_production (atómica) ──────────────
-- Suma stock del producto terminado y descuenta los insumos usados.
create or replace function public.register_production(
  p_product_id uuid,
  p_add_qty    numeric,
  p_items      jsonb,   -- [{ raw_material_id, quantity }]
  p_notes      text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_item     jsonb;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede registrar producción';
  end if;

  insert into public.production_batches (product_id, produced_qty, produced_by, notes)
  values (p_product_id, p_add_qty, auth.uid(), p_notes)
  returning id into v_batch_id;

  -- Suma producto terminado.
  insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
  values (p_product_id, p_add_qty, 'produccion', 'batch', v_batch_id, auth.uid());

  -- Descuenta insumos.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.stock_movements (raw_material_id, delta, reason, ref_type, ref_id, created_by)
    values (
      (v_item->>'raw_material_id')::uuid,
      -1 * (v_item->>'quantity')::numeric,
      'produccion', 'batch', v_batch_id, auth.uid()
    );
  end loop;

  return v_batch_id;
end;
$$;

grant execute on function public.register_production(uuid, numeric, jsonb, text) to authenticated;

-- ── 5. Vistas de stock actual (respetan RLS del que consulta) ──
create or replace view public.raw_material_stock
with (security_invoker = true) as
  select r.id as raw_material_id, r.name, r.unit, r.min_stock,
         coalesce(sum(m.delta), 0) as stock
  from public.raw_materials r
  left join public.stock_movements m on m.raw_material_id = r.id
  group by r.id;

create or replace view public.product_stock
with (security_invoker = true) as
  select p.id as product_id, p.name, p.unit, p.min_stock,
         coalesce(sum(m.delta), 0) as stock
  from public.products p
  left join public.stock_movements m on m.product_id = p.id
  where p.active = true
  group by p.id;

-- ============================================================
-- Notas:
-- · Las compras de insumos y los ajustes/mermas se registran como
--   movimientos (delta positivo = entrada, negativo = salida).
-- · El stock puede quedar negativo (no bloquea); queda visible para revisión.
-- · min_stock define el "aviso de stock bajo" en la pantalla de Stock.
-- ============================================================
