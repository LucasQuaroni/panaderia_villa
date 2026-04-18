'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import Image from 'next/image'

const links = [
  { href: '#inicio', label: 'Inicio' },
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#productos', label: 'Productos' },
  { href: '#contacto', label: 'Contacto' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleNav = (href: string) => {
    setMenuOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md shadow-lg shadow-burgundy/10'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-20">
          {/* Logo */}
          <button onClick={() => handleNav('#inicio')} className="flex items-center gap-2 group">
            <Image
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-pzsxhOTUTwtcCJEniT8BlyynX5e4TT.png"
              alt="Panadería Villa"
              width={90}
              height={50}
              className="object-contain"
            />
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNav(link.href)}
                className={`font-body text-sm font-medium tracking-wide transition-colors duration-200 relative group ${
                  scrolled ? 'text-charcoal hover:text-burgundy' : 'text-white hover:text-gold'
                }`}
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gold group-hover:w-full transition-all duration-300" />
              </button>
            ))}
            <button
              onClick={() => handleNav('#contacto')}
              className="ml-2 px-5 py-2.5 rounded-full text-sm font-medium font-body bg-burgundy text-cream hover:bg-burgundy-dark transition-all duration-200 shadow-md hover:shadow-lg hover:scale-105 active:scale-100"
            >
              Hacer Pedido
            </button>
          </nav>

          {/* Mobile burger */}
          <button
            className={`md:hidden p-2 rounded-lg transition-colors ${
              scrolled ? 'text-charcoal' : 'text-white'
            }`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menú"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-burgundy-dark/98 backdrop-blur-md flex flex-col items-center justify-center gap-8 md:hidden"
          >
            <button
              className="absolute top-6 right-6 text-cream p-2"
              onClick={() => setMenuOpen(false)}
            >
              <X size={28} />
            </button>
            {links.map((link, i) => (
              <motion.button
                key={link.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                onClick={() => handleNav(link.href)}
                className="text-cream text-3xl font-sans font-semibold hover:text-gold transition-colors"
              >
                {link.label}
              </motion.button>
            ))}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 }}
              onClick={() => handleNav('#contacto')}
              className="mt-4 px-8 py-3 rounded-full bg-gold text-charcoal font-body font-semibold text-lg hover:bg-gold/90 transition-colors"
            >
              Hacer Pedido
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
