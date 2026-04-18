import type { Metadata } from 'next'
import { Playfair_Display, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

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
  title: 'Panadería Villa — Hecho con amor, horneado con pasión',
  description:
    'Panadería artesanal Villa. Desde 1987 elaboramos panes, facturas y tortas con ingredientes naturales y recetas de familia. Pedidos y consultas online.',
  keywords: 'panadería, pan artesanal, facturas, tortas, Villa, panadería artesanal',
  openGraph: {
    title: 'Panadería Villa',
    description: 'Hecho con amor, horneado con pasión',
    type: 'website',
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
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
