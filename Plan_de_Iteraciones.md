# Panadería Villa — Plan de Iteraciones

> Plan de trabajo para desarrollo. Complementa a `Panaderia_Villa_Plan_Evolutivo.docx`.
> Actualizado: Julio 2026 · Revisión 1

## Cómo leer este plan

**Prioridades**

- **P0** — Fundacional o bloqueante. Se hace primero.
- **P1** — Alto valor, sin bloquear.
- **P2** — Mejora / puede esperar.

**Esfuerzo:** S (≤2 días) · M (media semana) · L (una semana) · XL (varias semanas, se subdivide).

Cada iteración deja algo **usable**. El orden respeta dependencias: seguridad antes de manejar dinero, ventas antes de stock de ventas, base firme antes del POS grande.

---

## Dos tracks en paralelo desde mañana

El posicionamiento local (lo de mayor ROI) **no necesita programar**: lo puede arrancar la familia mientras el desarrollo avanza en el código.

| Track | Quién | Arranca |
|---|---|---|
| **Desarrollo** (código) | Dev | Iteración 0 |
| **Negocio / SEO no-código** | Familia | Hoy mismo (ver más abajo) |

---

## Para empezar MAÑANA (día 1)

**Desarrollo:**

1. Clonar y levantar el proyecto en local; revisar acceso al panel de Supabase.
2. Crear rama `dev` y un flujo simple de trabajo (rama por iteración).
3. Arrancar Iteración 0, tarea 1 (tabla de roles + RLS).

**Negocio (la familia, sin dev):**

1. Reclamar/verificar el **Perfil de Empresa de Google** en business.google.com.
2. Sacar y subir **30+ fotos** (fachada reconocible, productos, interior).
3. Poner un **QR de reseñas** en el mostrador y empezar a pedirlas.

Estos 3 pasos de negocio son casi gratis y ya empiezan a mover el ranking esta semana.

---

## Resumen de iteraciones

| # | Iteración | Prioridad | Esfuerzo | Deja usable |
|---|---|---|---|---|
| 0 | Fundaciones: seguridad, roles, imágenes | P0 | L | Panel seguro con roles reales |
| 1 | Cambios mínimos + impresión de precios | P0/P1 | L | Alta libre, buscadores, kg/unidad, lista imprimible |
| 2 | SEO técnico del sitio | P1 | M | Web posicionada para Corral de Bustos |
| 3 | Modo mostrador táctil (UX) | P1 | L | Pantalla de atención lista (sin cobrar aún) |
| 4 | POS offline — núcleo de ventas | P0 | XL | Registrar ventas offline |
| 5 | Caja: apertura y cierre diario | P0 | L | Cierre de caja digital |
| 6 | Control de stock | P1 | L | Stock de insumos, producción y ventas |
| 7 | Balanza automática (Web Serial) | P2 | M | Peso leído directo de la balanza |

---

## Iteración 0 — Fundaciones · P0 · Esfuerzo L

**Objetivo:** base segura antes de sumar dinero al sistema.

- [x] Migración SQL: tabla de roles / `user_roles` (admin, cajero). **P0 · S** → `scripts/002_roles_and_rls.sql`
- [x] Políticas RLS por rol en todas las tablas (lectura/escritura según rol). **P0 · M** → `scripts/002_roles_and_rls.sql`
- [ ] Crear el primer usuario "atención al público" (paso manual en Supabase, ya habilitado — ver `scripts/README_migraciones.md`). **P0 · S**
- [x] Gatear acceso por rol: guards de rutas admin + nav por rol. Las escrituras sensibles quedan protegidas por RLS. **P0 · M** *(refactor completo a server actions: follow-up opcional, RLS ya protege).*
- [x] Migrar imágenes de producto de base64 → Supabase Storage (nuevas cargas). **P1 · M** → `scripts/003_storage_images.sql` + `products/page.tsx`
- [ ] Quitar `images.unoptimized` en `next.config`. **P1 · S** *(diferido a propósito: se mantiene hasta migrar las imágenes base64 existentes, para no romper el sitio).*
- [x] Activar chequeos de TypeScript en el build. **P2 · S** *(corregidos los 11 errores previos de framer-motion; `ignoreBuildErrors: false`).*

**Criterio de aceptación:** un usuario cajero logueado **no** puede ver ni editar costos/recetas; el admin sí. Las imágenes cargan desde Storage. La app compila con TS activado en las páginas migradas.

**Entrega a Lucas:** archivos de migración SQL listos para correr en el panel de Supabase.

---

## Iteración 1 — Cambios mínimos + impresión · P0/P1 · Esfuerzo L

**Objetivo:** los 3 pedidos concretos + el botón más esperado. Reemplaza el cálculo semanal a mano.

- [x] Buscador en Materias Primas (filtra por nombre/proveedor en vivo). **P1 · S** → `costs/page.tsx`
- [x] Buscador en Productos/Recetas (filtra por nombre/categoría en vivo). **P1 · S** → `costs/page.tsx` + `products/page.tsx`
- [x] Alta de producto personalizado por nombre (autocompleta; si no existe, lo crea al vuelo). **P0 · M** → `costs/page.tsx`
- [x] Modalidad de receta **por kg o por unidad** (selector + cálculo y visualización coherentes). **P0 · M** → `costs/page.tsx`
- [x] Botón "Imprimir lista de precios": hoja en celdas, por categoría, con fecha de actualización. **P1 · M** → `app/admin/prices/page.tsx` *(también accesible al rol cajero)*

**Criterio de aceptación:** se puede crear una receta escribiendo un producto nuevo sin pasar por la sección Productos; los buscadores filtran al instante; una receta marcada "por kg" muestra precio por kg en todos lados; el botón imprime una hoja prolija lista para el mostrador.

---

## Iteración 2 — SEO técnico del sitio · P1 · Esfuerzo M

**Objetivo:** que la web asocie a Panadería Villa con Corral de Bustos y cargue rápido. (Se puede solapar con Iter. 1.)

- [x] Título, descripción y textos con **"Panadería en Corral de Bustos"**. **P1 · S** → `app/layout.tsx` + `lib/site-config.ts`
- [x] Datos estructurados JSON-LD **Bakery/LocalBusiness** (NAP, geo, horarios). **P1 · S** → `components/public/StructuredData.tsx`
- [x] `sitemap.ts` y `robots.ts` (nativos de Next.js). **P1 · S** → `app/sitemap.ts` + `app/robots.ts`
- [x] Open Graph completo con imagen (para que el link se vea bien en WhatsApp). **P1 · S** → `app/layout.tsx`
- [ ] Verificar Core Web Vitals. **P2 · S** *(requiere estar publicado; correr PageSpeed).*
- [ ] Enlazar Instagram/Facebook con NAP idéntico. **P2 · S** *(cargar URLs en `lib/site-config.ts`; ver `SEO_NOTAS.md`).*

**Config pendiente (no-código):** definir `NEXT_PUBLIC_SITE_URL` con el dominio real. Ver `SEO_NOTAS.md`.

**Criterio de aceptación:** el test de resultados enriquecidos de Google valida el schema; el sitemap es accesible; PageSpeed mejora respecto del estado actual; el título en Google muestra el pueblo.

---

## Iteración 3 — Modo mostrador táctil (UX) · P1 · Esfuerzo L

**Objetivo:** la pantalla de atención, amigable y táctil-first (todavía sin lógica de cobro real).

- [ ] Layout "modo mostrador" sin el menú de administración. **P1 · M**
- [ ] Botones grandes, texto claro, pocos pasos; funciona con dedo o mouse. **P1 · M**
- [ ] Grilla de productos con favoritos/más vendidos arriba. **P1 · S**
- [ ] Estados vacíos que guían y confirmaciones claras ("Venta registrada ✓"). **P2 · S**

**Criterio de aceptación:** quien atiende ve una pantalla simple, toca un producto y arma un "carrito" de prueba; se ve bien en pantalla táctil y con mouse.

---

## Iteración 4 — POS offline (núcleo de ventas) · P0 · Esfuerzo XL

**Objetivo:** registrar ventas, con o sin internet. Es el tramo más grande; se subdivide.

- [ ] Migraciones: `sales`, `sale_items`, `payment_methods`, `stock_movements`. **P0 · M**
- [ ] PWA + service worker (la caja se instala y abre sin internet). **P0 · M**
- [ ] Almacén local (IndexedDB): cada venta se guarda al instante con UUID. **P0 · L**
- [ ] Flujo de venta: elegir producto → peso manual / unidades → medio de pago → registrar. **P0 · L**
- [ ] Cola de sincronización idempotente (sube al reconectar, sin duplicar). **P0 · L**
- [ ] RPC transaccional venta → descuento de stock (con reconciliación, sin frenar el cobro). **P0 · M**
- [ ] Indicador de estado: "sin conexión — X por subir" / "todo sincronizado". **P1 · S**
- [ ] Corregir/anular la última venta (según permiso a definir). **P1 · S**

**Criterio de aceptación:** se puede cobrar con internet cortado; al volver la conexión las ventas suben solas y no se duplican; el stock se descuenta correctamente.

> **Decisión pendiente antes de arrancar:** lista de medios de pago y quién puede corregir una venta.

---

## Iteración 5 — Caja: apertura y cierre · P0 · Esfuerzo L

**Objetivo:** reemplazar el cierre de caja en papel.

- [ ] Migración: `cash_sessions` (fondo inicial, cierre, totales, diferencias). **P0 · S**
- [ ] Apertura de caja (declarar fondo inicial). **P0 · S**
- [ ] Cierre diario: total por medio de pago, efectivo esperado vs. contado, diferencia. **P0 · M**
- [ ] Métricas del día: cantidad de tickets, producto más vendido, ticket promedio. **P1 · S**
- [ ] Consultar cierres de días anteriores. **P1 · S**

**Criterio de aceptación:** se abre caja a la mañana, se cierra a la noche con un botón y el resumen cuadra; queda guardado y consultable.

---

## Iteración 6 — Control de stock · P1 · Esfuerzo L

**Objetivo:** stock real de insumos, producción y ventas.

- [ ] Compras de materias primas (entradas de stock). **P1 · S**
- [ ] Tandas de producción (`production_batches`): consumen insumos, suman producto. **P1 · M**
- [ ] Avisos de stock bajo. **P1 · S**
- [ ] Mermas y ajustes de inventario. **P2 · S**
- [ ] Reportes básicos de stock y ventas. **P1 · M**

**Criterio de aceptación:** al cargar una tanda baja el stock de insumos y sube el de producto; las ventas descuentan producto; se ve cuánto se vendió y cuánto queda.

---

## Iteración 7 — Balanza automática · P2 · Esfuerzo M

**Objetivo:** leer el peso directo de la Systel Clipse (mejora sobre un POS que ya funciona).

- [ ] Prueba de lectura del puerto serie para confirmar la trama exacta. **P2 · S**
- [ ] Comprar el adaptador USB-serie (kit Systel a PC). **P2 · S**
- [ ] Módulo Web Serial: abrir puerto (9600 8N1), parsear trama ASCII, validar XOR. **P2 · M**
- [ ] Integrar el peso al flujo de venta (con carga manual como respaldo). **P2 · S**

**Criterio de aceptación:** al poner un producto en la balanza, el peso aparece solo en la pantalla de venta; si la lectura falla, se puede tipear.

---

## Track de negocio (la familia, sin dev) — arranca ya · P0 por ROI

- [ ] Reclamar y **verificar el Perfil de Empresa de Google**.
- [ ] Categoría principal "Panadería" + secundarias reales.
- [ ] Completar todo: dirección, teléfono, horarios (¡y feriados!), atributos.
- [ ] Subir **30+ fotos** (objetivo 100 en 6 meses).
- [ ] **QR de reseñas** en mostrador, bolsas y ticket; pedir 2-4 por semana.
- [ ] Responder todas las reseñas.
- [ ] Publicaciones semanales (Google Posts): novedades, "recién salido del horno".
- [ ] NAP idéntico en web, Google, Instagram y Facebook.
- [ ] Cartel en el acceso con el nombre exacto (el mismo de Google) + QR al mapa.

**Expectativa:** top 3 del mapa en 3-6 meses de trabajo sostenido.

---

## Dependencias clave

- Iteración 0 (roles/RLS) **antes** que cualquier módulo con dinero (4, 5).
- Iteración 4 (ventas) **antes** que el "stock de ventas" de la 6.
- La balanza (7) depende de un POS que ya funcione (4).
- El SEO no-código (track de negocio) no depende de nada: **cuanto antes, mejor**.

## Riesgos a vigilar

- **Reconciliación de stock offline:** varias ventas offline sobre el mismo stock. Regla: nunca frenar el cobro; marcar inconsistencias para revisión.
- **Prueba de balanza:** confirmar la trama real antes de comprar hardware.
- **Hosting comercial:** decidir Cloudflare Pages vs. Vercel Pro antes de producción (no bloquea el desarrollo).
