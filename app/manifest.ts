import type { MetadataRoute } from 'next'

/**
 * Manifest de la app — permite "instalar" el mostrador en la notebook como
 * si fuera una aplicación (ícono propio, ventana sin barra del navegador).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Panadería Villa — Mostrador',
    short_name: 'Villa Mostrador',
    description: 'Punto de venta de Panadería Villa: ventas, carrito y caja.',
    start_url: '/admin/pos',
    display: 'standalone',
    background_color: '#F3EDE4',
    theme_color: '#7A2E39',
    lang: 'es-AR',
    icons: [
      { src: '/logo-final.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
