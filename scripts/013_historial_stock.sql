-- ============================================================
-- Panadería Villa · Historial de stock consultable por fecha
-- Migración 013 (ejecutar después de la 012)
-- ============================================================
-- El stock de cada producto es la suma de sus stock_movements, así que el
-- stock que había en cualquier momento pasado se reconstruye sumando los
-- movimientos anteriores a ese momento. Esta migración es de solo lectura:
-- no crea, borra ni modifica movimientos, ventas ni caja.
--
-- stock_history(desde, hasta) devuelve, por producto:
--   · opening      → stock al inicio del período (antes de "desde")
--   · sold         → lo que salió por ventas, neto de anulaciones y
--                    correcciones (incluye consumo interno)
--   · waste        → mermas / descartes
--   · adjustments  → conteos de existencia final, ajustes puntuales y
--                    cualquier otro movimiento (positivo suma, negativo resta)
--   · closing      → stock al final del período (antes de "hasta")
-- Siempre se cumple: opening - sold - waste + adjustments = closing.
-- Solo el administrador puede consultarla.
-- ============================================================

-- Acelera la suma por producto hasta una fecha y el detalle de un día.
create index if not exists stock_mov_product_created_idx
  on public.stock_movements (product_id, created_at);

create or replace function public.stock_history(p_from timestamptz, p_to timestamptz)
returns table (
  product_id     uuid,
  name           text,
  unit           text,
  active         boolean,
  opening        numeric,
  sold           numeric,
  waste          numeric,
  adjustments    numeric,
  closing        numeric,
  movement_count integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede consultar el historial de stock';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;

  return query
  with classified as (
    select m.product_id,
           m.delta,
           m.created_at,
           case
             when m.ref_type in ('sale', 'sale_correction', 'void')
               or m.reason in ('venta', 'consumo_interno', 'correccion_venta', 'anulacion') then 'sale'
             when m.reason = 'merma' then 'waste'
             else 'adjustment'
           end as kind
    from public.stock_movements m
    where m.product_id is not null
      and m.created_at < p_to
  ), totals as (
    select c.product_id,
           coalesce(sum(c.delta) filter (where c.created_at < p_from), 0) as opening,
           coalesce(-sum(c.delta) filter (where c.created_at >= p_from and c.kind = 'sale'), 0) as sold,
           coalesce(-sum(c.delta) filter (where c.created_at >= p_from and c.kind = 'waste'), 0) as waste,
           coalesce(sum(c.delta) filter (where c.created_at >= p_from and c.kind = 'adjustment'), 0) as adjustments,
           coalesce(sum(c.delta), 0) as closing,
           (count(*) filter (where c.created_at >= p_from))::integer as movement_count
    from classified c
    group by c.product_id
  )
  select p.id,
         p.name,
         p.unit,
         p.active,
         coalesce(t.opening, 0)::numeric,
         coalesce(t.sold, 0)::numeric,
         coalesce(t.waste, 0)::numeric,
         coalesce(t.adjustments, 0)::numeric,
         coalesce(t.closing, 0)::numeric,
         coalesce(t.movement_count, 0)
  from public.products p
  left join totals t on t.product_id = p.id
  -- Los productos dados de baja solo aparecen si tuvieron movimientos en el período.
  where p.active or coalesce(t.movement_count, 0) > 0
  order by p.name;
end;
$$;

revoke all on function public.stock_history(timestamptz, timestamptz) from public, anon;
grant execute on function public.stock_history(timestamptz, timestamptz) to authenticated;
