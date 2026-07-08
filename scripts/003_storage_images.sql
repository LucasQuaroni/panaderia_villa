-- ============================================================
-- Panadería Villa · Iteración 0 — Storage de imágenes
-- Migración 003
-- ============================================================
-- Objetivo: dejar de guardar las fotos de productos como texto
-- (base64) dentro de la base y pasarlas a Supabase Storage,
-- guardando solo el enlace. Más rápido y más liviano.
--
-- Ejecutar en: Supabase → SQL Editor (después de 002).
-- ============================================================

-- ── 1. Bucket público para imágenes de producto ───────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- ── 2. Políticas del bucket ───────────────────────────────
-- Lectura pública (las fotos se ven en el sitio).
drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');

-- Subir / modificar / borrar: solo admin.
drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects
  for insert with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects
  for update using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects
  for delete using (bucket_id = 'product-images' and public.is_admin());

-- ============================================================
-- Nota: las imágenes YA cargadas como base64 seguirán
-- funcionando. A medida que se editen productos y se suba una
-- nueva foto, quedarán en Storage. Cuando ya no quede ninguna
-- base64, se puede activar la optimización de imágenes de
-- Next.js (quitar images.unoptimized en next.config.mjs).
-- ============================================================
