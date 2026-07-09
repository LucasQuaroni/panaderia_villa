import { SITE, socialLinks } from '@/lib/site-config'

/**
 * Datos estructurados (JSON-LD) tipo Bakery/LocalBusiness.
 * Le dice a Google que sos una panadería en Corral de Bustos, con dirección,
 * teléfono, horarios y ubicación exactos. Mejora el posicionamiento local y
 * habilita resultados enriquecidos en la búsqueda y en Maps.
 */
export default function StructuredData() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    '@id': `${SITE.url}/#bakery`,
    name: SITE.name,
    description: SITE.description,
    url: SITE.url,
    telephone: SITE.telephone,
    image: `${SITE.url}${SITE.ogImage}`,
    priceRange: '$$',
    currenciesAccepted: 'ARS',
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.city,
      addressRegion: SITE.address.region,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.countryCode,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: SITE.geo.lat,
      longitude: SITE.geo.lng,
    },
    hasMap: `https://www.google.com/maps/search/?api=1&query=${SITE.geo.lat},${SITE.geo.lng}`,
    openingHoursSpecification: SITE.openingHours.map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days,
      opens: h.opens,
      closes: h.closes,
    })),
    ...(socialLinks.length > 0 ? { sameAs: socialLinks } : {}),
  }

  return (
    <script
      type="application/ld+json"
      // El contenido es data controlada por nosotros (no input de usuario).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
