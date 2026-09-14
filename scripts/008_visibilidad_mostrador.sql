-- Panadería Villa · Visibilidad de productos en los mostradores
-- Un producto oculto conserva sus recetas, stock y todo su historial.
alter table public.products
  add column if not exists show_on_pos boolean not null default true;

comment on column public.products.show_on_pos is
  'Si es false, el producto no se ofrece en los mostradores minorista ni mayorista.';
