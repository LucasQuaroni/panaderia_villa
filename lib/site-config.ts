/**
 * Configuración central del sitio — datos del negocio para SEO.
 *
 * IMPORTANTE: definí la variable de entorno NEXT_PUBLIC_SITE_URL con el dominio
 * real (ej: https://www.panaderiavilla.com.ar) en tu hosting. Sin eso, se usa
 * el valor por defecto de abajo, que conviene reemplazar por el dominio real.
 */
export const SITE = {
  name: 'Panadería Villa',
  slogan: 'Tradición y Excelencia desde 1947',
  // Descripción con la localidad — clave para el posicionamiento local.
  description:
    'Panadería artesanal en Corral de Bustos, Córdoba. Desde 1947 elaboramos pan, ' +
    'facturas, tortas y pastelería con recetas de familia. Pedidos y consultas.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.panaderiavilla.com.ar',

  telephone: '+54 3468 580183',
  whatsapp: '+543468580183',

  address: {
    street: 'Independencia 154',
    city: 'Corral de Bustos',
    region: 'Córdoba',
    postalCode: '2645',
    countryCode: 'AR',
  },

  geo: { lat: -33.283625, lng: -62.1839518 },

  // Horario legible (para mostrar) y estructurado (para Google).
  hoursText: 'Lunes a viernes de 7:30 a 12:30 y de 17 a 20. Sábados de 8:30 a 12:30.',
  openingHours: [
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '07:30', closes: '12:30' },
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '17:00', closes: '20:00' },
    { days: ['Saturday'], opens: '08:30', closes: '12:30' },
  ],

  // Imagen para compartir en redes / WhatsApp (1200x630 recomendado).
  ogImage: '/hero-bread.jpg',

  // Redes sociales — completá con las URLs reales cuando existan.
  // Suman "prominencia" y aparecen en el conocimiento de Google.
  social: {
    instagram: '', // ej: 'https://www.instagram.com/panaderiavilla'
    facebook: '',  // ej: 'https://www.facebook.com/panaderiavilla'
  },

  // Palabras clave locales.
  keywords: [
    'panadería Corral de Bustos',
    'panadería artesanal Corral de Bustos',
    'facturas Corral de Bustos',
    'pan artesanal Córdoba',
    'tortas Corral de Bustos',
    'panadería cerca de la ruta',
    'Panadería Villa',
  ],
}

/** URLs de redes válidas (para el campo sameAs de los datos estructurados). */
export const socialLinks = Object.values(SITE.social).filter(Boolean)
