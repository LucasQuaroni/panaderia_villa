import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { SITE } from '@/lib/site-config'
import StructuredData from '@/components/public/StructuredData'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: 'Panadería Villa — Panadería artesanal en Corral de Bustos',
    template: '%s · Panadería Villa',
  },
  description: SITE.description,
  keywords: SITE.keywords,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Panadería Villa — Panadería artesanal en Corral de Bustos',
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: 'Panadería Villa — Corral de Bustos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Panadería Villa — Panadería artesanal en Corral de Bustos',
    description: SITE.description,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/logo-final.png',
    apple: '/logo-final.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={`${playfair.variable} ${inter.variable} bg-background`}>
      <body className="font-body antialiased">
        <StructuredData />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
