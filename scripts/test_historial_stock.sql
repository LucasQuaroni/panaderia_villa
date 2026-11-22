-- Ejecutar SOLO en una base local nueva cuyo nombre empiece con villa_test.
-- Carga datos ficticios. No se debe ejecutar en Supabase de producción.
\set ON_ERROR_STOP on
do $$ begin if current_database() !~ '^villa_test' then raise exception 'Esta prueba exige una base local villa_test'; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated, anon;
grant execute on function auth.uid() to authenticated;
-- Supabase concede todo a anon/authenticated al crear tablas y funciones.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
\ir 001_schema.sql
\ir 002_roles_and_rls.sql
\ir 004_ventas_stock_caja.sql
\ir 005_stock.sql
\ir 006_precios_presentaciones_consumo.sql
\ir 007_mayoristas_caja_compartida.sql
\ir 008_visibilidad_mostrador.sql
\ir 009_stock_consistencia.sql
\ir 010_fiados_y_atencion.sql
\ir 011_pagos_parciales_y_correcciones.sql
\ir 012_gastos_y_sueldos.sql
\ir 013_historial_stock.sql
-- Reejecutarla no falla.
\ir 013_historial_stock.sql

create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FALLÓ: %',label; end if; end $$;
create function public.test_failure(command text,expected text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; else raise; end if; end;
 raise exception 'Se aceptó indebidamente: %',command;
end $$;
grant execute on function public.test_assert(boolean,text), public.test_failure(text,text) to authenticated;
insert into auth.users values('11111111-1111-1111-1111-111111111111'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.user_roles(user_id,role) values('11111111-1111-1111-1111-111111111111','admin'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cashier');

delete from public.products;
insert into public.products(id,name,unit,active) values
 ('33333333-3333-3333-3333-333333333333','Medialuna ficticia','unidad',true),
 ('44444444-4444-4444-4444-444444444444','Pan ficticio','kg',true),
 ('55555555-5555-5555-5555-555555555555','Producto dado de baja','unidad',false),
 ('66666666-6666-6666-6666-666666666666','Baja sin movimientos','unidad',false);

-- Día anterior: queda en 40 medialunas y 10 kg de pan.
insert into public.stock_movements(product_id,delta,reason,ref_type,created_at) values
 ('33333333-3333-3333-3333-333333333333',50,'ajuste','existencia_final_manual','2026-11-09 20:00-03'),
 ('33333333-3333-3333-3333-333333333333',-10,'venta','sale','2026-11-09 21:00-03'),
 ('44444444-4444-4444-4444-444444444444',10,'ajuste','existencia_final_manual','2026-11-09 20:00-03');
-- Día consultado (10/11): ventas, una anulación, una corrección, merma y conteo.
insert into public.stock_movements(product_id,delta,reason,ref_type,created_at) values
 ('33333333-3333-3333-3333-333333333333',-12,'venta','sale','2026-11-10 08:30-03'),
 ('33333333-3333-3333-3333-333333333333',2,'anulacion','void','2026-11-10 09:00-03'),
 ('33333333-3333-3333-3333-333333333333',-1,'correccion_venta','sale_correction','2026-11-10 10:00-03'),
 ('33333333-3333-3333-3333-333333333333',-3,'consumo_interno','sale','2026-11-10 11:00-03'),
 ('33333333-3333-3333-3333-333333333333',-4,'merma','movimiento_manual','2026-11-10 18:00-03'),
 ('33333333-3333-3333-3333-333333333333',30,'ajuste','existencia_final_manual','2026-11-10 19:00-03'),
 ('44444444-4444-4444-4444-444444444444',-2.75,'venta','sale','2026-11-10 12:00-03'),
 ('55555555-5555-5555-5555-555555555555',-1,'venta','sale','2026-11-10 12:00-03');
-- Día siguiente: no debe afectar el cierre del 10/11.
insert into public.stock_movements(product_id,delta,reason,ref_type,created_at) values
 ('33333333-3333-3333-3333-333333333333',-5,'venta','sale','2026-11-11 08:00-03');

set role authenticated;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';

create temp table day_result as select * from public.stock_history('2026-11-10 00:00-03','2026-11-11 00:00-03');
select public.test_assert((select opening=40 and sold=14 and waste=4 and adjustments=30 and closing=52 and movement_count=6
  from day_result where product_id='33333333-3333-3333-3333-333333333333'),'medialunas: inicio, ventas netas, merma, conteo y cierre');
select public.test_assert((select opening-sold-waste+adjustments=closing from day_result where product_id='33333333-3333-3333-3333-333333333333'),'la fila cierra: inicio - ventas - mermas + ajustes = cierre');
select public.test_assert((select opening=10 and sold=2.75 and closing=7.25 from day_result where product_id='44444444-4444-4444-4444-444444444444'),'pan por kg con decimales');
select public.test_assert((select closing=-1 from day_result where product_id='55555555-5555-5555-5555-555555555555'),'producto dado de baja con movimientos en el día aparece');
select public.test_assert(not exists(select 1 from day_result where product_id='66666666-6666-6666-6666-666666666666'),'producto dado de baja sin movimientos no aparece');

-- Consulta a una hora puntual del mismo día (10/11 a las 10:30).
select public.test_assert((select closing=29 and sold=11 from public.stock_history('2026-11-10 00:00-03','2026-11-10 10:30-03')
  where product_id='33333333-3333-3333-3333-333333333333'),'stock a una hora puntual');
-- Antes de cualquier movimiento todo vale cero.
select public.test_assert((select bool_and(opening=0 and closing=0) from public.stock_history('2026-01-01 00:00-03','2026-01-02 00:00-03')),'sin movimientos previos el stock es cero');
-- El cierre de hoy coincide con el stock actual de la vista.
select public.test_assert((select h.closing=s.stock from public.stock_history('2026-11-11 00:00-03','2100-01-01 00:00-03') h
  join public.product_stock s on s.product_id=h.product_id where h.product_id='33333333-3333-3333-3333-333333333333'),'cierre hasta hoy = stock actual');
select public.test_failure($q$select * from public.stock_history('2026-11-11','2026-11-10')$q$,'Rango de fechas inválido');

set request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.test_failure($q$select * from public.stock_history('2026-11-10','2026-11-11')$q$,'Solo un administrador');

reset role;
select public.test_assert(not has_function_privilege('anon','public.stock_history(timestamptz,timestamptz)','EXECUTE'),'anon no consulta el historial');
select public.test_assert((select count(*)=12 from public.stock_movements),'la consulta no crea movimientos');
select 'OK: historial de stock' as resultado;
