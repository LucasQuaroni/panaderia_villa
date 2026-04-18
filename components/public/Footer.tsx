'use client'

import Image from 'next/image'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-burgundy-dark text-cream/70">
      <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Image
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-pzsxhOTUTwtcCJEniT8BlyynX5e4TT.png"
            alt="Panadería Villa"
            width={70}
            height={40}
            className="object-contain brightness-200 opacity-80"
          />
          <div>
            <div className="font-sans text-lg font-bold text-cream">Panadería Villa</div>
            <div className="font-body text-xs text-cream/50">Hecho con amor desde 1987</div>
          </div>
        </div>

        <div className="flex items-center gap-6 font-body text-sm">
          {['Inicio', 'Nosotros', 'Productos', 'Contacto'].map((item) => (
            <button
              key={item}
              onClick={() => document.querySelector(`#${item.toLowerCase()}`)?.scrollIntoView({ behavior: 'smooth' })}
              className="hover:text-gold transition-colors"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="font-body text-xs text-cream/40 text-center">
          © {year} Panadería Villa. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  )
}
