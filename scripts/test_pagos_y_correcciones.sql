-- Ejecutar SOLO en una base local nueva cuyo nombre empiece con villa_test.
-- Carga datos ficticios. No se debe ejecutar en Supabase de producción.
\set ON_ERROR_STOP on
do $$ begin if current_database() !~ '^villa_test' then raise exception 'Esta prueba exige una base local villa_test'; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated;
grant execute on function auth.uid() to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
-- Supabase concede EXECUTE a anon/authenticated al crear funciones.
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

create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FALLÓ: %',label; end if; end $$;
create function public.test_failure(command text,expected text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; else raise; end if; end;
 raise exception 'Se aceptó indebidamente: %',command;
end $$;
insert into auth.users values('11111111-1111-1111-1111-111111111111'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.user_roles(user_id,role) values('11111111-1111-1111-1111-111111111111','admin'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cashier');
insert into public.cash_sessions(id,status,opening_float) values('22222222-2222-2222-2222-222222222222','open',1000);
insert into public.products(id,name,price) values('33333333-3333-3333-3333-333333333333','Producto ficticio',5000);
insert into public.retail_customers(id,name) values('44444444-4444-4444-4444-444444444444','Cliente ficticio');
insert into public.wholesale_customers(id,business_name,has_current_account) values('66666666-6666-6666-6666-666666666666','Comercio ficticio',true);
set role authenticated;
set request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.register_partial_sale('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','minorista','44444444-4444-4444-4444-444444444444','[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":2,"stock_quantity":2,"unit_price":5000,"subtotal":10000}]',4000,'Efectivo');
select public.register_partial_sale('55555555-5555-5555-5555-555555555555','22222222-2222-2222-2222-222222222222','minorista','44444444-4444-4444-4444-444444444444','[{"quantity":2,"subtotal":10000}]',4000,'Efectivo');
select public.test_assert((select balance=6000 from public.retail_account_balances where id='44444444-4444-4444-4444-444444444444'),'saldo minorista después de abono');
select public.test_assert((select count(*)=1 from public.retail_account_payments),'reintento no duplica abono');
select public.test_assert((select sum(amount)=4000 from public.cash_movements),'abono contado una sola vez como venta');
select public.register_partial_sale('77777777-7777-7777-7777-777777777777','22222222-2222-2222-2222-222222222222','mayorista','66666666-6666-6666-6666-666666666666','[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":2,"stock_quantity":2,"unit_price":5000,"subtotal":10000}]',2500,'Transferencia');
select public.test_assert((select balance=7500 from public.wholesale_account_balances where id='66666666-6666-6666-6666-666666666666'),'saldo mayorista después de abono');
select public.register_retail_payment('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222',6000,'Transferencia');
select public.register_wholesale_payment('66666666-6666-6666-6666-666666666666','22222222-2222-2222-2222-222222222222',7500,'Efectivo');
select public.test_assert((select balance=0 from public.retail_account_balances where id='44444444-4444-4444-4444-444444444444'),'fiado saldado');
select public.test_assert((select balance=0 from public.wholesale_account_balances where id='66666666-6666-6666-6666-666666666666'),'mayorista saldado');
select public.test_assert((select count(*)=2 from public.cash_movements where source='account_payment'),'ambos cobros en caja');
select public.test_assert((select sum(amount)=20000 from public.cash_movements),'abonos y saldos sin duplicar');
select public.test_failure($q$select public.correct_sale(gen_random_uuid(),(select id from public.sales limit 1),0,'[]','Efectivo',0,'Efectivo','Prueba de permiso',null,null)$q$,'Solo el administrador');
select public.test_assert(not has_function_privilege('anon','public.correct_sale(uuid,uuid,integer,jsonb,text,numeric,text,text,uuid,uuid)','EXECUTE'),'anon no puede ejecutar correcciones con los permisos por defecto de Supabase');
select public.test_assert(not has_function_privilege('anon','public.register_partial_sale(uuid,uuid,text,uuid,jsonb,numeric,text)','EXECUTE'),'anon no puede registrar abonos');
select public.test_assert(not has_function_privilege('anon','public.close_cash_session(uuid,numeric,numeric,text,numeric)','EXECUTE'),'anon no puede cerrar caja');
set request.jwt.claim.sub='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select public.test_failure($q$select public.register_partial_sale(gen_random_uuid(),'22222222-2222-2222-2222-222222222222','minorista','44444444-4444-4444-4444-444444444444','[]',1,'Efectivo')$q$,'No autorizado');
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.test_assert((select sum(delta)=-4 from public.stock_movements),'stock descontado una vez en cada venta');
select public.test_failure($q$select public.correct_sale(gen_random_uuid(),(select id from public.sales where client_uuid='55555555-5555-5555-5555-555555555555'),0,'[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":1,"stock_quantity":1,"unit_price":5000,"subtotal":5000}]','Fiado',4000,'Efectivo','Intento bajar venta saldada',null,null)$q$,'cobros de cuenta sin deuda');
select public.test_assert((select sum(delta)=-4 from public.stock_movements),'corrección rechazada no cambia stock');
select public.test_assert((select revision=0 and total=10000 from public.sales where client_uuid='55555555-5555-5555-5555-555555555555'),'corrección rechazada conserva venta');
select public.register_sale('99999999-9999-9999-9999-999999999999','22222222-2222-2222-2222-222222222222','Efectivo','[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":1,"stock_quantity":0.5,"unit_price":2000,"subtotal":2000}]');
select public.register_wholesale_sale('cccccccc-cccc-cccc-cccc-cccccccccccc','22222222-2222-2222-2222-222222222222','Transferencia','66666666-6666-6666-6666-666666666666','[{"description":"Varios","unit":"unidad","quantity":1,"stock_quantity":1,"unit_price":3000,"subtotal":3000}]');
select public.test_assert((select sum(amount)=25000 from public.cash_movements),'incluye venta mayorista por transferencia');
-- Snapshot del turno previo, cerrado. Una nueva caja recibe los ajustes.
select public.test_failure($q$select public.close_cash_session('22222222-2222-2222-2222-222222222222',14501,14500,'noche',1000)$q$,'Los movimientos de caja cambiaron');
select public.test_assert((select status='open' from public.cash_sessions where id='22222222-2222-2222-2222-222222222222'),'rechazar cierre desactualizado conserva caja abierta');
select public.close_cash_session('22222222-2222-2222-2222-222222222222',14500,14500,'noche',1000);
reset role;
insert into public.cash_sessions(id,status,opening_float) values('88888888-8888-8888-8888-888888888888','open',1000);
set role authenticated;
select public.correct_sale('dddddddd-dddd-dddd-dddd-dddddddddddd',(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999'),0,'[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":2,"stock_quantity":1,"unit_price":1750,"subtotal":3500}]','Efectivo',0,'Efectivo','Corregir cantidad del ticket','88888888-8888-8888-8888-888888888888',null);
select public.correct_sale('dddddddd-dddd-dddd-dddd-dddddddddddd',(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999'),0,'[]','Efectivo',0,'Efectivo','Reintento idempotente','88888888-8888-8888-8888-888888888888',null);
select public.test_assert((select count(*)=1 from public.sale_corrections),'reintento de corrección no duplica');
select public.test_assert((select sum(amount)=1500 from public.cash_movements where cash_session_id='88888888-8888-8888-8888-888888888888'),'ajuste en caja actual');
select public.test_assert((select sum(amount)=25000 from public.cash_movements where cash_session_id='22222222-2222-2222-2222-222222222222'),'cierre anterior conserva importes');
select public.test_assert((select sum(delta)=-5 from public.stock_movements),'ajusta diferencia de presentación de stock');
select public.test_failure($q$select public.correct_sale(gen_random_uuid(),(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999'),0,'[]','Efectivo',0,'Efectivo','Versión vieja',null,null)$q$,'La venta cambió');
select public.correct_sale('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999'),1,'[{"product_id":"33333333-3333-3333-3333-333333333333","description":"Producto ficticio","unit":"unidad","quantity":1.5,"stock_quantity":0.75,"unit_price":2000,"subtotal":3000}]','Transferencia',0,'Efectivo','Corregir monto y medio','88888888-8888-8888-8888-888888888888',null);
select public.test_assert((select sum(amount)=25000 from public.cash_movements where cash_session_id='22222222-2222-2222-2222-222222222222'),'segunda corrección no reescribe cierre');
select public.test_assert((select sum(amount)=-2000 from public.cash_movements where cash_session_id='88888888-8888-8888-8888-888888888888' and payment_method='Efectivo'),'ajuste acumulado efectivo');
select public.test_assert((select sum(amount)=3000 from public.cash_movements where cash_session_id='88888888-8888-8888-8888-888888888888' and payment_method='Transferencia'),'ajuste acumulado transferencia');
select public.test_assert((select sum(delta)=-4.75 from public.stock_movements),'stock conserva historial y compensa');
select public.test_assert((select stock=-4.75 from public.product_stock where product_id='33333333-3333-3333-3333-333333333333'),'la vista de stock real incluye las correcciones');
select public.test_assert((select -sum(m.delta)=0.75 from public.stock_movements m where
 (m.ref_type='sale' and m.ref_id=(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999'))
 or (m.ref_type='sale_correction' and m.ref_id in(select id from public.sale_corrections where sale_id=(select id from public.sales where client_uuid='99999999-9999-9999-9999-999999999999')))), 'auditoría combina descuento original y correcciones');
select public.test_failure($q$select public.change_sale_payment_method('99999999-9999-9999-9999-999999999999','Efectivo')$q$,'edición extraordinaria');
select public.test_failure($q$select public.register_partial_sale(gen_random_uuid(),'22222222-2222-2222-2222-222222222222','minorista','44444444-4444-4444-4444-444444444444','[{"quantity":1,"stock_quantity":1,"unit_price":100,"subtotal":100}]',50,'Efectivo')$q$,'Abrí la caja');
-- Convertir una venta minorista normal en fiado, seleccionando cliente.
select public.register_sale('ffffffff-ffff-ffff-ffff-ffffffffffff','88888888-8888-8888-8888-888888888888','Efectivo','[{"description":"Varios","unit":"unidad","quantity":1,"stock_quantity":1,"unit_price":1000,"subtotal":1000}]');
select public.correct_sale('12121212-1212-1212-1212-121212121212',(select id from public.sales where client_uuid='ffffffff-ffff-ffff-ffff-ffffffffffff'),0,'[{"description":"Varios","unit":"unidad","quantity":1,"stock_quantity":1,"unit_price":1000,"subtotal":1000}]','Fiado',300,'Efectivo','Cliente abonó una parte','88888888-8888-8888-8888-888888888888','44444444-4444-4444-4444-444444444444');
select public.test_assert((select balance=700 from public.retail_account_balances where id='44444444-4444-4444-4444-444444444444'),'corrección actualiza deuda de cliente');
select public.test_assert((select sum(amount)=-1700 from public.cash_movements where cash_session_id='88888888-8888-8888-8888-888888888888' and payment_method='Efectivo'),'caja abierta actualiza importe sin doble ajuste');
set request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.test_assert((select count(*)=0 from public.sale_corrections),'empleado no lee historial protegido');
select public.test_assert((select count(*)>0 from public.cash_movements),'empleado puede leer movimientos de caja');
update public.cash_sessions set counted_cash=999 where id='22222222-2222-2222-2222-222222222222';
select public.test_assert((select counted_cash=14500 from public.cash_sessions where id='22222222-2222-2222-2222-222222222222'),'empleado no puede reescribir un cierre directamente');
select public.test_failure($q$select public.void_sale('55555555-5555-5555-5555-555555555555')$q$,'cobros');
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
select public.test_assert((select sum(delta)=-4.75 from public.stock_movements),'anulación rechazada no modifica stock');
set request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.register_retail_payment('44444444-4444-4444-4444-444444444444','88888888-8888-8888-8888-888888888888',700,'Efectivo');
select public.test_assert((select balance=0 from public.retail_account_balances where id='44444444-4444-4444-4444-444444444444'),'se salda también una venta corregida con abono');
select public.test_failure($q$select public.close_cash_session('88888888-8888-8888-8888-888888888888',-700,0,'noche',0)$q$,'Los movimientos de caja cambiaron');
select public.close_cash_session('88888888-8888-8888-8888-888888888888',0,0,'noche',0);
select public.test_assert((select notes::jsonb->>'cash_withdrawn'='0' from public.cash_sessions where id='88888888-8888-8888-8888-888888888888'),'cierre guarda retiro contado');
select public.test_failure($q$select public.register_sale(gen_random_uuid(),'88888888-8888-8888-8888-888888888888','Efectivo','[{"description":"Varios","unit":"unidad","quantity":1,"stock_quantity":1,"unit_price":1000,"subtotal":1000}]')$q$,'La caja ya cerró');
select public.test_failure($q$select public.register_wholesale_payment('66666666-6666-6666-6666-666666666666','88888888-8888-8888-8888-888888888888',1,'Transferencia')$q$,'Abrí la caja');
reset role;
select 'OK: pagos parciales, saldos, caja, cierres, stock, reintentos, auditoría y permisos' as resultado;
