-- ============================================================
-- Panadería Villa · Iteración 0 — Roles y seguridad (RLS)
-- Migración 002
-- ============================================================
-- Objetivo: separar "admin" (todo) de "cajero/atención" (acceso
-- limitado) y hacer que la propia base rechace lo que no
-- corresponde al rol, sin depender solo de la pantalla de login.
--
-- Ejecutar en: Supabase → SQL Editor. Ver scripts/README_migraciones.md
-- ============================================================

-- ── 1. Tabla de roles ─────────────────────────────────────
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'cashier' check (role in ('admin', 'cashier')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- ── 2. Funciones de ayuda ─────────────────────────────────
-- SECURITY DEFINER: corren con permisos del dueño y así evitan
-- recursión infinita al leer user_roles dentro de las políticas.

create or replace function public.get_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- ── 3. Políticas sobre user_roles ─────────────────────────
drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_roles_admin_manage on public.user_roles;
create policy user_roles_admin_manage on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 4. PRODUCTS ───────────────────────────────────────────
-- Público: solo productos activos. Logueados (admin+cajero): todos.
-- Escritura: solo admin.
drop policy if exists public_read_products on public.products;
drop policy if exists products_public_read on public.products;
drop policy if exists products_auth_read on public.products;
drop policy if exists products_admin_write on public.products;

create policy products_public_read on public.products
  for select using (active = true);
create policy products_auth_read on public.products
  for select using (auth.uid() is not null);
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 5. RAW_MATERIALS (costos) — SOLO admin ────────────────
-- El cajero NO debe ver costos de materias primas.
drop policy if exists raw_materials_admin_all on public.raw_materials;
create policy raw_materials_admin_all on public.raw_materials
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 6. RECIPES / RECIPE_ITEMS (recetas y márgenes) — SOLO admin
drop policy if exists recipes_admin_all on public.recipes;
create policy recipes_admin_all on public.recipes
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists recipe_items_admin_all on public.recipe_items;
create policy recipe_items_admin_all on public.recipe_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 7. SITE_CONTENT — lectura pública, escritura admin ────
drop policy if exists public_read_site_content on public.site_content;
drop policy if exists site_content_public_read on public.site_content;
drop policy if exists site_content_admin_write on public.site_content;

create policy site_content_public_read on public.site_content
  for select using (true);
create policy site_content_admin_write on public.site_content
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 8. CONTACT_MESSAGES — inserta cualquiera, lee/gestiona admin
drop policy if exists public_insert_contact on public.contact_messages;
drop policy if exists contact_public_insert on public.contact_messages;
drop policy if exists contact_admin_read on public.contact_messages;
drop policy if exists contact_admin_update on public.contact_messages;
drop policy if exists contact_admin_delete on public.contact_messages;

create policy contact_public_insert on public.contact_messages
  for insert with check (true);
create policy contact_admin_read on public.contact_messages
  for select using (public.is_admin());
create policy contact_admin_update on public.contact_messages
  for update using (public.is_admin()) with check (public.is_admin());
create policy contact_admin_delete on public.contact_messages
  for delete using (public.is_admin());

-- ── 9. ORDERS — inserta cualquiera, lee/gestiona admin ────
drop policy if exists public_insert_orders on public.orders;
drop policy if exists orders_public_insert on public.orders;
drop policy if exists orders_admin_read on public.orders;
drop policy if exists orders_admin_update on public.orders;
drop policy if exists orders_admin_delete on public.orders;

create policy orders_public_insert on public.orders
  for insert with check (true);
create policy orders_admin_read on public.orders
  for select using (public.is_admin());
create policy orders_admin_update on public.orders
  for update using (public.is_admin()) with check (public.is_admin());
create policy orders_admin_delete on public.orders
  for delete using (public.is_admin());

-- ============================================================
-- 10. ASIGNAR EL PRIMER ADMIN  (¡IMPORTANTE!)
-- ------------------------------------------------------------
-- Reemplazá el email por el de tu usuario admin ya creado en
-- Supabase → Authentication → Users. Corré esto UNA vez.
-- ============================================================
--
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users
-- where email = 'TU_EMAIL_ADMIN@ejemplo.com'
-- on conflict (user_id) do update set role = 'admin';
--
-- Para crear un usuario cajero: creá el usuario en Authentication,
-- y luego:
-- insert into public.user_roles (user_id, role)
-- select id, 'cashier' from auth.users
-- where email = 'EMAIL_DEL_CAJERO@ejemplo.com'
-- on conflict (user_id) do update set role = 'cashier';
-- ============================================================
