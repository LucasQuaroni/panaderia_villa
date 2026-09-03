-- ============================================================
-- Panaderia Villa - Precios manuales, presentaciones y consumo
-- Migracion 006 (requiere 004)
-- ============================================================

-- Un precio manual no vuelve a ser reemplazado al editar su receta.
alter table public.products
  add column if not exists manual_price boolean not null default false;

-- Opciones del mostrador. Cada elemento tiene una etiqueta, la cantidad de
-- stock base que descuenta y, opcionalmente, un precio propio, por ejemplo:
-- [{"label":"Unidad","quantity":1},{"label":"Medio","quantity":0.5,"price":2500}]
alter table public.products
  add column if not exists sale_options jsonb not null default '[]'::jsonb;

-- Separa la cantidad vendida (por ejemplo, 2 medias unidades) de la cantidad
-- de stock que representa (en ese ejemplo, 1 unidad completa).
alter table public.sale_items
  add column if not exists stock_quantity numeric(12,3);

update public.sale_items
set stock_quantity = quantity
where stock_quantity is null;

-- Todos los precios de venta existentes quedan redondeados hacia arriba.
update public.products
set price = ceil(price / 100) * 100
where price is not null and price > 0;

-- Registra ventas normales y consumos internos. En un consumo interno los
-- renglones conservan su valor de referencia y el stock baja normalmente,
-- pero el total contable de la venta es cero.
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

  select id into v_sale_id from public.sales where client_uuid = p_client_uuid;
  if v_sale_id is not null then
    return v_sale_id;
  end if;

  if p_payment_method = 'Consumo interno' then
    v_total := 0;
  else
    select coalesce(sum((it->>'subtotal')::numeric), 0)
      into v_total
      from jsonb_array_elements(p_items) as it;
  end if;

  insert into public.sales (client_uuid, cash_session_id, sold_by, payment_method, total)
  values (p_client_uuid, p_cash_session_id, auth.uid(), p_payment_method, v_total)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.sale_items (sale_id, product_id, description, unit, quantity, stock_quantity, unit_price, subtotal)
    values (
      v_sale_id,
      nullif(v_item->>'product_id', '')::uuid,
      coalesce(v_item->>'description', 'Producto'),
      coalesce(v_item->>'unit', 'unidad'),
      (v_item->>'quantity')::numeric,
      coalesce((v_item->>'stock_quantity')::numeric, (v_item->>'quantity')::numeric),
      (v_item->>'unit_price')::numeric,
      (v_item->>'subtotal')::numeric
    );

    if nullif(v_item->>'product_id', '') is not null then
      insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
      values (
        (v_item->>'product_id')::uuid,
        -1 * coalesce((v_item->>'stock_quantity')::numeric, (v_item->>'quantity')::numeric),
        case when p_payment_method = 'Consumo interno' then 'consumo_interno' else 'venta' end,
        'sale', v_sale_id, auth.uid()
      );
    end if;
  end loop;

  return v_sale_id;
end;
$$;

grant execute on function public.register_sale(uuid, uuid, text, jsonb) to authenticated;

-- Corrige el medio de pago de una venta ya registrada sin tocar el stock.
create or replace function public.change_sale_payment_method(
  p_client_uuid uuid,
  p_payment_method text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_total numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select id into v_sale_id
  from public.sales
  where client_uuid = p_client_uuid
    and (sold_by = auth.uid() or public.is_admin());

  if v_sale_id is null then
    return false;
  end if;

  if p_payment_method = 'Consumo interno' then
    v_total := 0;
  else
    select coalesce(sum(subtotal), 0) into v_total
    from public.sale_items where sale_id = v_sale_id;
  end if;

  update public.sales
  set payment_method = p_payment_method, total = v_total
  where id = v_sale_id;

  update public.stock_movements
  set reason = case when p_payment_method = 'Consumo interno' then 'consumo_interno' else 'venta' end
  where ref_type = 'sale' and ref_id = v_sale_id;

  return true;
end;
$$;

grant execute on function public.change_sale_payment_method(uuid, text) to authenticated;

-- Al anular, devuelve exactamente la cantidad de stock descontada, incluso
-- cuando se vendio mediante una presentacion fraccionaria.
create or replace function public.void_sale(p_client_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select id into v_sale_id from public.sales where client_uuid = p_client_uuid;
  if v_sale_id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.sales s
    where s.id = v_sale_id and (s.sold_by = auth.uid() or public.is_admin())
  ) then
    raise exception 'No autorizado para anular esta venta';
  end if;

  for v_item in
    select product_id, coalesce(stock_quantity, quantity) as stock_quantity
    from public.sale_items
    where sale_id = v_sale_id and product_id is not null
  loop
    insert into public.stock_movements (product_id, delta, reason, ref_type, ref_id, created_by)
    values (v_item.product_id, v_item.stock_quantity, 'anulacion', 'void', v_sale_id, auth.uid());
  end loop;

  delete from public.sales where id = v_sale_id;
  return true;
end;
$$;

grant execute on function public.void_sale(uuid) to authenticated;
