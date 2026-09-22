-- Ajuste de existencia final sin pisar ventas concurrentes.
-- Ejecutar después de 008. No modifica movimientos históricos.

create or replace function public.lock_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Las ventas, mermas y ajustes comparten el mismo orden de escritura.
  perform pg_advisory_xact_lock(7030421);
  return new;
end;
$$;

drop trigger if exists stock_movement_write_lock on public.stock_movements;
create trigger stock_movement_write_lock
before insert on public.stock_movements
for each row execute function public.lock_stock_movement();

create or replace function public.set_product_stock(p_product_id uuid, p_target numeric, p_expected_current numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_current numeric(12,3);
  v_delta numeric(12,3);
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ajustar existencias';
  end if;
  if p_target is null or p_target < 0 or p_target > 999999999 then
    raise exception 'Existencia final inválida';
  end if;
  if p_target <> round(p_target, 3) then
    raise exception 'La existencia final admite hasta tres decimales';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and active) then
    raise exception 'Producto inválido o inactivo';
  end if;

  -- El lock se toma antes de leer la suma; ninguna venta puede insertar un
  -- movimiento entre esa lectura y el ajuste.
  perform pg_advisory_xact_lock(7030421);
  select coalesce(sum(delta), 0) into v_current
  from public.stock_movements where product_id = p_product_id;
  if p_expected_current is null or v_current <> p_expected_current then
    raise exception 'El stock cambió mientras contabas. Actualizá y revisá la existencia final antes de guardar';
  end if;
  v_delta := p_target - v_current;
  if v_delta <> 0 then
    insert into public.stock_movements
      (product_id, delta, reason, ref_type, created_by)
    values (p_product_id, v_delta, 'ajuste', 'existencia_final_manual', auth.uid());
  end if;
  return p_target;
end;
$$;

revoke all on function public.set_product_stock(uuid, numeric, numeric) from public;
grant execute on function public.set_product_stock(uuid, numeric, numeric) to authenticated;
