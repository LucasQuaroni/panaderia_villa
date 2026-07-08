# SEO — Notas de configuración (Iteración 2)

Lo implementado en el código deja la web lista para posicionar. Faltan un par de
ajustes de configuración y los pasos "de negocio" (no-código), que son los de
mayor retorno.

## 1. Definir el dominio (obligatorio)

El SEO usa la URL del sitio para el sitemap, los enlaces canónicos y las imágenes
para compartir. Definí esta variable de entorno en tu hosting (Vercel/Cloudflare)
**y** en el archivo `.env` local:

```
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO-REAL
```

Mientras no la definas, se usa el valor por defecto de `lib/site-config.ts`
(`https://www.panaderiavilla.com.ar`), que conviene reemplazar por el real.

## 2. Cargar redes sociales (opcional pero recomendado)

En `lib/site-config.ts`, completá `social.instagram` y `social.facebook` con las
URLs reales. Se agregan a los datos estructurados (campo `sameAs`) y ayudan a que
Google asocie las cuentas al negocio.

## 3. Imagen para compartir (opcional)

Al compartir el link (WhatsApp, redes) se muestra `public/hero-bread.jpg`. Si
querés otra, cambiá `ogImage` en `lib/site-config.ts` por otra imagen de
`public/` (ideal 1200x630 px).

## Qué quedó hecho en el código

- Título y descripción con **"Corral de Bustos"** (antes no aparecía).
- **Datos estructurados JSON-LD** tipo `Bakery` con dirección, teléfono, horarios
  y ubicación (`components/public/StructuredData.tsx`).
- **Open Graph y Twitter Card** completos con imagen.
- **`sitemap.xml`** y **`robots.txt`** automáticos (`app/sitemap.ts`, `app/robots.ts`).
  El panel `/admin` y `/auth` quedan fuera del índice.
- `metadataBase` y enlace canónico.

## Cómo verificar (después de publicar)

- **Datos estructurados:** pegá la URL en el test de resultados enriquecidos de
  Google (search.google.com/test/rich-results). Debe detectar "Bakery".
- **Sitemap:** abrí `https://TU-DOMINIO/sitemap.xml` — debe listar la home.
- **Compartir:** pegá el link en WhatsApp; debe verse el título, la descripción y
  la foto.
- **Velocidad:** corré PageSpeed Insights sobre la home. (Recordá que la
  optimización total de imágenes se activa al migrar las fotos base64 — ver
  `next.config.mjs`.)

## Lo que rinde más (track de negocio, sin código)

Está detallado en `Panaderia_Villa_Plan_Evolutivo.docx` (sección 11) y en
`Plan_de_Iteraciones.md`: reclamar el **Perfil de Empresa de Google**, subir
30+ fotos, y pedir reseñas con un QR. Eso mueve el ranking local más que
cualquier cambio en la web.
