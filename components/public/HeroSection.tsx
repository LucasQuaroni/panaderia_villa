'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { ChevronDown } from 'lucide-react'

interface HeroSectionProps {
  title: string
  subtitle: string
}

export default function HeroSection({ title, subtitle }: HeroSectionProps) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '35%'])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  const scrollDown = () => {
    document.querySelector('#nosotros')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <>
      <section
        ref={ref}
        id="inicio"
        className="relative h-screen min-h-[640px] overflow-hidden flex items-center justify-center"
      >
      {/* Parallax background */}
      <motion.div
        style={{ y }}
        className="absolute inset-0 scale-110"
      >
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/hero-bread.jpg)' }}
        />
        {/* Multi-layer overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-burgundy-dark/70 via-burgundy/50 to-charcoal/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-burgundy-dark/40 via-transparent to-transparent" />
      </motion.div>

      {/* Animated grain texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Decorative circle accents */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full border border-gold/20 animate-pulse" />
      <div className="absolute top-1/3 right-1/3 w-64 h-64 rounded-full border border-cream/10" />

      {/* Content */}
      <motion.div
        style={{ opacity }}
        className="relative z-10 text-center px-6 max-w-4xl mx-auto mt-8 md:mt-32"
      >
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <div className="h-px w-12 bg-gold" />
          <span className="text-gold font-body text-sm tracking-[0.25em] uppercase font-medium">
            Tradición y Excelencia desde 1948
          </span>
          <div className="h-px w-12 bg-gold" />
        </motion.div>

        {/* Main title */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35 }}
          className="font-sans text-5xl md:text-7xl lg:text-8xl text-white font-bold leading-tight text-balance mb-6"
        >
          {title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="font-body text-lg md:text-xl text-cream/85 max-w-2xl mx-auto leading-relaxed mb-10"
        >
          {subtitle}
        </motion.p>

        {/* CTA buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={() => document.querySelector('#productos')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-cream font-body font-semibold rounded-full transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 active:scale-100 text-base"
          >
            Ver Productos
          </button>
          <button
            onClick={() => document.querySelector('#contacto')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-4 border-2 border-cream/60 hover:border-gold hover:text-gold text-cream font-body font-semibold rounded-full transition-all duration-300 text-base backdrop-blur-sm"
          >
            Hacer Pedido
          </button>
        </motion.div>

      </motion.div>
    </section>

    {/* Barra de Estadísticas */}
    <div className="bg-charcoal border-t-4 border-gold py-10 relative z-20 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-center gap-12 md:gap-32">
        {[
          { value: '+75', label: 'Años de historia' },
          { value: '+50', label: 'Productos artesanales' },
          { value: '100%', label: 'Ingredientes naturales' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-gold font-sans text-4xl md:text-5xl font-bold mb-1">{stat.value}</div>
            <div className="text-cream/80 font-body text-xs md:text-sm tracking-[0.2em] uppercase font-semibold">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
