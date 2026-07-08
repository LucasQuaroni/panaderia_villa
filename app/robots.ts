import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site-config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // No indexar el panel ni las pantallas de acceso.
      disallow: ['/admin', '/auth'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  }
}
