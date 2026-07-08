# Migraciones — Iteración 0 (Seguridad y roles)

Estos pasos se corren **una sola vez** en tu proyecto de Supabase. No borran datos.

## Orden de ejecución

1. **`002_roles_and_rls.sql`** — crea la tabla de roles y las reglas de seguridad (RLS).
2. **`003_storage_images.sql`** — crea el bucket de imágenes de producto.

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
