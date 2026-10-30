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
-- Reejecutarla no duplica categorías ni falla.
\ir 012_gastos_y_sueldos.sql

create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FALLÓ: %',label; end if; end $$;
create function public.test_failure(command text,expected text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if position(expected in sqlerrm)>0 then return; else raise; end if; end;
 raise exception 'Se aceptó indebidamente: %',command;
end $$;
grant execute on function public.test_assert(boolean,text), public.test_failure(text,text) to authenticated;
insert into auth.users values('11111111-1111-1111-1111-111111111111'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.user_roles(user_id,role) values('11111111-1111-1111-1111-111111111111','admin'),('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cashier');
insert into public.cash_sessions(id,status,opening_float) values('22222222-2222-2222-2222-222222222222','open',1000);

select public.test_assert((select count(*)=9 from public.expense_categories),'categorías iniciales sin duplicar');
select public.test_assert((select count(*)=1 from public.expense_categories where kind='sueldos'),'una sola categoría de sueldos');
select public.test_assert((select count(*)=2 from public.expense_categories where kind='personal'),'gastos personales de Vale y Estela');
select public.test_assert(not has_table_privilege('anon','public.expenses','SELECT'),'anon no lee gastos');
select public.test_assert(not has_table_privilege('anon','public.employees','SELECT'),'anon no lee empleados');
select public.test_assert(not has_table_privilege('authenticated','public.expenses','DELETE'),'los gastos no se borran');
select public.test_assert(not has_table_privilege('authenticated','public.employees','DELETE'),'los empleados no se borran');

set role authenticated;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
insert into public.expenses(id,expense_date,category_id,description,payee,amount,payment_method)
select '33333333-3333-3333-3333-333333333333','2026-10-05',id,' Harina 000 ',' Molino ',150000,'Transferencia' from public.expense_categories where name='Proveedores';
select public.test_assert((select created_by='11111111-1111-1111-1111-111111111111' and description='Harina 000' and payee='Molino' from public.expenses where id='33333333-3333-3333-3333-333333333333'),'gasto con autor y textos limpios');
select public.test_failure($q$insert into public.expenses(category_id,amount,payment_method) select id,1000,'Efectivo' from public.expense_categories where kind='sueldos'$q$,'Elegí el empleado');
select public.test_failure($q$insert into public.expenses(category_id,amount,payment_method) select id,0,'Efectivo' from public.expense_categories where name='Impuestos'$q$,'expenses_amount_check');
select public.test_failure($q$insert into public.expenses(category_id,amount,payment_method) select id,10,'Débito' from public.expense_categories where name='Impuestos'$q$,'expenses_payment_method_check');
insert into public.employees(id,full_name,position,salary,pay_frequency) values('44444444-4444-4444-4444-444444444444','Empleada ficticia','Atención',500000,'Mensual');
insert into public.expenses(id,expense_date,category_id,amount,payment_method,employee_id,salary_period,description)
select '55555555-5555-5555-5555-555555555555','2026-10-31',id,500000,'Efectivo','44444444-4444-4444-4444-444444444444','octubre 2026','Sueldo' from public.expense_categories where kind='sueldos';
insert into public.expenses(id,category_id,amount,payment_method,employee_id,salary_period)
select '66666666-6666-6666-6666-666666666666',id,20000,'Tarjeta','44444444-4444-4444-4444-444444444444','octubre 2026' from public.expense_categories where name='Vale';
select public.test_assert((select employee_id is null and salary_period='' from public.expenses where id='66666666-6666-6666-6666-666666666666'),'un gasto personal no queda asociado a un empleado');
update public.expenses set voided_at=now() where id='66666666-6666-6666-6666-666666666666';
select public.test_assert((select voided_by='11111111-1111-1111-1111-111111111111' from public.expenses where id='66666666-6666-6666-6666-666666666666'),'anulación registra quién anuló');
update public.expenses set voided_at=null where id='66666666-6666-6666-6666-666666666666';
select public.test_assert((select voided_by is null from public.expenses where id='66666666-6666-6666-6666-666666666666'),'restaurar limpia la anulación');
update public.expense_categories set active=false where name='Alquiler';
select public.test_failure($q$insert into public.expenses(category_id,amount,payment_method) select id,1000,'Efectivo' from public.expense_categories where name='Alquiler'$q$,'desactivada');
select public.test_failure($q$delete from public.expenses$q$,'permission denied');
select public.test_assert((select sum(amount)=670000 from public.expenses where voided_at is null),'total de gastos activos');
select public.test_assert((select count(*)=0 from public.cash_movements),'los gastos no aparecen en la caja');

set request.jwt.claim.sub='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select public.test_assert((select count(*)=0 from public.expenses),'atención no ve gastos');
select public.test_assert((select count(*)=0 from public.employees),'atención no ve empleados ni sueldos');
select public.test_assert((select count(*)=0 from public.expense_categories),'atención no ve categorías');
select public.test_failure($q$insert into public.employees(full_name) values('Intruso')$q$,'row-level security');
-- RLS hace que la modificación no alcance ninguna fila.
update public.expenses set amount=1 where true;

reset role;
select public.test_assert((select amount=150000 from public.expenses where id='33333333-3333-3333-3333-333333333333'),'atención no modificó importes');
select 'OK: gastos y sueldos' as resultado;
