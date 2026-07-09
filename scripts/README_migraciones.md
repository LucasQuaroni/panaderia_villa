# Migraciones — Supabase

Estos pasos se corren **una sola vez** en tu proyecto de Supabase. No borran datos.

## Orden de ejecución

1. **`002_roles_and_rls.sql`** — crea la tabla de roles y las reglas de seguridad (RLS).
2. **`003_storage_images.sql`** — crea el bucket de imágenes de producto.
3. **`004_ventas_stock_caja.sql`** — crea el modelo de ventas, stock y caja del
   mostrador (POS) y las funciones `register_sale` / `void_sale`. Requiere la `002`.
4. **`005_stock.sql`** — control de stock: tandas de producción, umbrales de
   stock bajo, ajustes/mermas y vistas de stock actual. Requiere la `002` y la `004`.

### Cómo correr cada archivo

1. Entrá a tu proyecto en [app.supabase.com](https://app.supabase.com).
2. Menú lateral → **SQL Editor** → **New query**.
3. Pegá el contenido del archivo `.sql` y hacé clic en **Run**.
4. Repetí con el siguiente archivo.

## Paso obligatorio: asignar el primer admin

Después de correr `002`, tenés que decir quién es el administrador. Si todavía no
tenés tu usuario, crealo en **Authentication → Users → Add user**. Luego, en el
SQL Editor, corré (cambiando el email):

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users
where email = 'TU_EMAIL_ADMIN@ejemplo.com'
on conflict (user_id) do update set role = 'admin';
```

### Crear un usuario "atención al público" (cajero)

1. **Authentication → Users → Add user** (email + contraseña).
2. En el SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'cashier' from auth.users
where email = 'EMAIL_DEL_CAJERO@ejemplo.com'
on conflict (user_id) do update set role = 'cashier';
```

## Cómo verificar que quedó bien

- **Como admin:** entrás al panel y ves todas las secciones (Productos, Contenido,
  Mensajes, Pedidos, Calculadora de Costos).
- **Como cajero:** entrás y solo ves el Dashboard; si intentás abrir
  `/admin/costs` a mano, te devuelve al Dashboard. No puede ver costos ni recetas.
- **Imágenes:** al editar un producto y subir una foto nueva, se guarda en Storage
  (el enlace empieza con `https://<tu-proyecto>.supabase.co/...`), ya no en base64.

## Notas

- Las imágenes viejas en base64 siguen funcionando. Se reemplazan a medida que
  editás cada producto y subís una foto nueva.
- Cuando ya no queden imágenes en base64, se puede activar la optimización de
  Next.js (poner `unoptimized: false` en `next.config.mjs`) para más velocidad.
- Los usuarios nuevos **no** tienen acceso hasta que un admin les asigna un rol.

## Cómo probar el mostrador (POS)

Después de correr `004`:

1. Entrá al panel y andá a **Mostrador (Ventas)** (visible para admin y cajero).
2. **Abrí la caja** con el fondo inicial de efectivo.
3. Tocá un producto:
   - Si se vende **por kg**, se abre "Pesar" → escribí el peso (cuando conectes
     la balanza, se completará solo) → Agregar al carrito.
   - Si se vende **por unidad**, se agrega directo (podés sumar/restar cantidad).
4. Se va armando el **carrito** a la derecha, con el total.
5. **Cobrar** → elegí el medio de pago → queda registrada.
6. Al final del día, **Cerrar caja** muestra el total por medio de pago, el
   efectivo esperado vs. lo contado, y la diferencia.

### Modo offline

- Cada venta se guarda primero en la notebook y se sincroniza sola cuando hay
  internet (arriba se ve "En línea / Sin conexión" y "X por subir").
- Si se corta internet **mientras la pantalla está abierta**, podés seguir
  cobrando; las ventas suben al volver la conexión, sin duplicarse.
- También funciona tras **cerrar y reabrir** sin internet: el service worker
  cachea la app (una vez abierta con conexión) y el catálogo/caja quedan
  guardados en la notebook. **Requisito:** abrir la app al menos una vez con
  internet para que se cachee.
- **Instalar como app:** en Chrome → menú → "Instalar" / "Crear acceso directo".
  Queda con su ícono, como un programa más.

## Balanza (SYSTEL Clipse)

- Necesitás el **adaptador USB–serie (DB9)** ("kit Systel a PC").
- Funciona en **Chrome o Edge** y con el sitio en **HTTPS** (o en localhost).
- En el mostrador, botón **"Conectar balanza"** → elegís el puerto una vez.
  Desde entonces se **reconecta sola** al abrir la caja.
- Al pesar un producto por kg, el peso aparece solo; igual podés tipearlo.
- Si el peso no se lee bien, se ajusta el parseo en `lib/pos/scale.ts`
  (función `parseWeight`) — la conexión ya queda hecha. Conviene probarlo en el
  negocio con el cable puesto.

## Orden recomendado para dejarlo listo en el negocio

1. Correr `002` → `003` → `004` → `005` en Supabase.
2. Asignarte admin y crear el usuario cajero.
3. Definir `NEXT_PUBLIC_SITE_URL` y desplegar (HTTPS).
4. Cargar materias primas, recetas (con kg/unidad) y productos con precio.
5. Registrar la producción del día (descuenta insumos, suma producto).
6. Abrir la app en Chrome, "Instalar", conectar la balanza y abrir caja.
7. ¡A vender!
