'use client'

import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef, useState } from 'react'
import Image from 'next/image'
import { ShoppingBag, Star } from 'lucide-react'

interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  unit: string
  category: string | null
  image_url: string | null
  featured: boolean
}

interface ProductsSectionProps {
  products: Product[]
}

const categories = ['Todos', 'Panes', 'Facturas', 'Tortas', 'Especiales']

const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, delay: i * 0.08, ease: 'easeOut' },
  }),
}


function ProductCard({ product, index }: { product: Product; index: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      variants={cardVariants}
      custom={index}
      className="group relative bg-white rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border border-border cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="relative h-52 overflow-hidden bg-cream-dark">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-700"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-6xl opacity-30">🍞</div>
          </div>
        )}
        {/* Category badge */}
        {product.category && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full">
            <span className="font-body text-xs font-semibold text-burgundy tracking-wide">
              {product.category}
            </span>
          </div>
        )}
        {/* Featured badge */}
        {product.featured && (
          <div className="absolute top-3 right-3 w-8 h-8 bg-gold rounded-full flex items-center justify-center shadow-md">
            <Star size={14} fill="white" className="text-white" />
          </div>
        )}
        {/* Hover overlay */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-burgundy/80 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="text-center text-white px-4"
              >
                <p className="font-body text-sm leading-relaxed">{product.description}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-sans text-lg font-bold text-charcoal mb-1 group-hover:text-burgundy transition-colors">
          {product.name}
        </h3>
        <p className="font-body text-xs text-warm-gray line-clamp-2 leading-relaxed mb-4">
          {product.description}
        </p>
        <div className="flex items-center justify-end">
          <a
            href="#contacto"
            onClick={(e) => {
              e.preventDefault()
              document.querySelector('#contacto')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-burgundy/10 hover:bg-burgundy text-burgundy hover:text-cream rounded-full transition-all duration-200 text-xs font-body font-semibold"
          >
            <ShoppingBag size={12} />
            Pedir
          </a>
        </div>
      </div>
    </motion.div>
  )
}

export default function ProductsSection({ products }: ProductsSectionProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [activeCategory, setActiveCategory] = useState('Todos')

  const filtered = activeCategory === 'Todos'
    ? products
    : products.filter((p) => p.category === activeCategory)

  return (
    <section
      ref={ref}
      id="productos"
      className="section-padding relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #f5f0eb 0%, #ffffff 40%, #f5f0eb 100%)',
      }}
    >
      {/* Background image with overlay */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/products-bg.jpg)' }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-12"
        >
          <span className="text-burgundy font-body text-sm tracking-[0.25em] uppercase font-semibold">
            Lo mejor de la panadería
          </span>
          <h2 className="font-sans text-4xl md:text-5xl font-bold text-charcoal mt-2 text-balance">
            Nuestros Productos
          </h2>
          <div className="mx-auto mt-4 w-16 h-1 bg-gold rounded-full" />
          <p className="mt-4 font-body text-warm-gray max-w-xl mx-auto text-base leading-relaxed">
            Elaborados cada día con ingredientes seleccionados y recetas que han pasado de generación en generación.
          </p>
        </motion.div>

        {/* Category filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-3 mb-12"
        >
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 rounded-full font-body text-sm font-medium transition-all duration-250 ${
                activeCategory === cat
                  ? 'bg-burgundy text-cream shadow-md shadow-burgundy/30'
                  : 'bg-white text-warm-gray hover:text-burgundy border border-border hover:border-burgundy'
              }`}
            >
              {cat}
            </button>
          ))}
        </motion.div>

        {/* Products grid */}
        <motion.div
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </AnimatePresence>
        </motion.div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-warm-gray font-body">
            No hay productos en esta categoría.
          </div>
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-center mt-14"
        >
          <a
            href="#contacto"
            onClick={(e) => {
              e.preventDefault()
              document.querySelector('#contacto')?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="inline-flex items-center gap-2 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-cream font-body font-semibold rounded-full transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-100"
          >
            <ShoppingBag size={18} />
            Hacer un Pedido
          </a>
        </motion.div>
      </div>
    </section>
  )
}
