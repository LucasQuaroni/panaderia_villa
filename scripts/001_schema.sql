-- ============================================================
-- Panadería Villa – Database Schema
-- ============================================================

-- ── Site content ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_content (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.site_content (key, value) VALUES
  ('hero_title',       'Hecho con amor, horneado con pasión'),
  ('hero_subtitle',    'Desde 1987 trayendo el sabor artesanal a tu mesa'),
  ('about_title',      'Quiénes Somos'),
  ('about_body',       'Villa nació de la pasión de dos hermanos panaderos que soñaban con llevar el pan artesanal de calidad a cada hogar. Con más de 75 años de historia, seguimos usando las recetas originales de la familia.'),
  ('founder1_name',    'Carlos Villa'),
  ('founder1_role',    'Co-fundador & Maestro Panadero'),
  ('founder1_bio',     'Carlos aprendió el arte de la panadería a los 14 años junto a su abuelo. Su dedicación y técnica son el alma de cada pan que sale de nuestro horno.'),
  ('founder2_name',    'María Villa'),
  ('founder2_role',    'Co-fundadora & Directora'),
  ('founder2_bio',     'María transformó la visión familiar en un negocio próspero. Su instinto comercial y amor por los clientes hicieron crecer a Villa hasta lo que es hoy.'),
  ('contact_address',  'Av. del Pan 1234, Ciudad'),
  ('contact_phone',    '+54 11 1234-5678'),
  ('contact_email',    'hola@panaderiavilla.com'),
  ('contact_hours',    'Lunes a Sábado: 7:00 – 20:00 | Domingo: 8:00 – 14:00'),
  ('map_lat',          '-34.6037'),
  ('map_lng',          '-58.3816'),
  ('map_zoom',         '15')
ON CONFLICT (key) DO NOTHING;

-- ── Products ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  description TEXT,
  price       NUMERIC(10,2),
  unit        TEXT    NOT NULL DEFAULT 'unidad',  -- 'unidad' | 'kg'
  category    TEXT,
  image_url   TEXT,
  featured    BOOLEAN NOT NULL DEFAULT false,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.products (name, description, price, unit, category, featured, sort_order) VALUES
  ('Pan Francés',       'Clásico pan de corteza crocante y miga suave, horneado dos veces al día.',       150,  'unidad', 'Panes',     true,  1),
  ('Medialunas',        'Medialunas de manteca hojaldradas, tiernas y con el dulzor justo.',              120,  'unidad', 'Facturas',  true,  2),
  ('Pan de Campo',      'Pan de campo artesanal con semillas de girasol y chía. Sabor profundo.',        850,  'kg',     'Panes',     true,  3),
  ('Rogel',             'Torta de hojaldre con dulce de leche. El postre estrella de la casa.',           3200, 'unidad', 'Tortas',    false, 4),
  ('Vigilantes',        'Facturas rellenas con membrillo y dulce de leche.',                              180,  'unidad', 'Facturas',  false, 5),
  ('Brioche',           'Pan brioche artesanal con manteca importada. Ideal para el desayuno.',           420,  'unidad', 'Especiales',false, 6)
ON CONFLICT DO NOTHING;

-- ── Raw materials ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  unit        TEXT    NOT NULL DEFAULT 'kg',  -- 'kg' | 'unidad' | 'litro' | 'gramo'
  unit_price  NUMERIC(10,4) NOT NULL DEFAULT 0,
  stock       NUMERIC(10,3),
  supplier    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.raw_materials (name, unit, unit_price, supplier) VALUES
  ('Harina 000',         'kg',      350,    'Molinos Cañuelas'),
  ('Harina 0000',        'kg',      420,    'Molinos Cañuelas'),
  ('Azúcar',             'kg',      600,    'Ledesma'),
  ('Manteca',            'kg',      3200,   'La Serenísima'),
  ('Huevos',             'unidad',  120,    'Granja Local'),
  ('Levadura',           'gramo',   8,      'Calsa'),
  ('Sal',                'kg',      180,    'Celusal'),
  ('Dulce de Leche',     'kg',      2800,   'La Salamandra'),
  ('Membrillo',          'kg',      1200,   'Frutas del Sur'),
  ('Leche',              'litro',   550,    'La Serenísima')
ON CONFLICT DO NOTHING;

-- ── Recipes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipes (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  yield_qty     NUMERIC(10,3) NOT NULL DEFAULT 1,   -- how many units / kg the recipe produces
  markup_pct    NUMERIC(6,2)  NOT NULL DEFAULT 250, -- markup percentage over cost
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Recipe items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recipe_items (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID    NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  raw_material_id UUID    NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  quantity        NUMERIC(12,4) NOT NULL DEFAULT 1,  -- in the raw material's own unit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Contact messages ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  phone      TEXT,
  message    TEXT    NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  phone       TEXT,
  items       JSONB   NOT NULL DEFAULT '[]',
  notes       TEXT,
  status      TEXT    NOT NULL DEFAULT 'pendiente',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────
ALTER TABLE public.site_content      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders            ENABLE ROW LEVEL SECURITY;

-- Public read for published content
CREATE POLICY "public_read_site_content" ON public.site_content FOR SELECT USING (true);
CREATE POLICY "public_read_products"     ON public.products     FOR SELECT USING (active = true);
CREATE POLICY "public_insert_contact"    ON public.contact_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "public_insert_orders"     ON public.orders            FOR INSERT WITH CHECK (true);

-- Admin full access (service role bypasses RLS; these are for anon key admin pages)
-- We use the service role key on server actions for admin operations.
