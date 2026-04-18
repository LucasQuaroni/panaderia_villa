'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import Image from 'next/image'

interface ContentMap {
  [key: string]: string
}

interface AboutSectionProps {
  content: ContentMap
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.15, ease: 'easeOut' },
  }),
}

export default function AboutSection({ content }: AboutSectionProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section ref={ref} id="nosotros" className="section-padding bg-cream-dark relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-burgundy/5 rounded-full -translate-y-1/2 translate-x-1/3" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-gold/10 rounded-full translate-y-1/3 -translate-x-1/4" />

      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center mb-16"
        >
          <span className="text-burgundy font-body text-sm tracking-[0.25em] uppercase font-semibold">
            Nuestra Historia
          </span>
          <h2 className="font-sans text-4xl md:text-5xl font-bold text-charcoal mt-2 text-balance">
            {content.about_title || 'Quiénes Somos'}
          </h2>
          <div className="mx-auto mt-4 w-16 h-1 bg-gold rounded-full" />
        </motion.div>

        {/* About content + image */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-24">
          <motion.div
            variants={fadeUp}
            custom={1}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3]">
              <Image
                src="/about-bakery.jpg"
                alt="El equipo de Panadería Villa"
                fill
                className="object-cover"
              />
              {/* Burgundy overlay accent */}
              <div className="absolute inset-0 bg-gradient-to-t from-burgundy-dark/40 to-transparent" />
            </div>
            {/* Floating accent card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="absolute -bottom-6 -right-6 bg-burgundy text-cream rounded-2xl p-5 shadow-xl"
            >
              <div className="font-sans text-3xl font-bold">+35</div>
              <div className="font-body text-xs text-cream/80 mt-1">años horneando</div>
            </motion.div>
          </motion.div>

          <motion.div
            variants={fadeUp}
            custom={2}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
            className="flex flex-col gap-6"
          >
            <p className="font-body text-lg text-warm-gray leading-relaxed">
              {content.about_body}
            </p>
            <div className="grid grid-cols-2 gap-4 mt-2">
              {[
                { icon: '🌾', label: 'Harina premium', desc: 'Seleccionada artesanalmente' },
                { icon: '🔥', label: 'Horno de piedra', desc: 'Temperatura perfecta' },
                { icon: '🧑‍🍳', label: 'Recetas de familia', desc: 'Transmitidas por generaciones' },
                { icon: '🌿', label: 'Sin conservantes', desc: '100% natural y fresco' },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 p-4 bg-white rounded-xl shadow-sm border border-border">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <div className="font-body font-semibold text-charcoal text-sm">{item.label}</div>
                    <div className="font-body text-xs text-warm-gray">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Founders */}
        <motion.div
          variants={fadeUp}
          custom={3}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center mb-12"
        >
          <span className="text-burgundy font-body text-sm tracking-[0.25em] uppercase font-semibold">
            Las personas detrás del pan
          </span>
          <h3 className="font-sans text-3xl md:text-4xl font-bold text-charcoal mt-2">
            Nuestros Fundadores
          </h3>
          <div className="mx-auto mt-4 w-12 h-1 bg-gold rounded-full" />
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {[
            {
              name: content.founder1_name,
              role: content.founder1_role,
              bio: content.founder1_bio,
              image: '/founder-carlos.jpg',
              delay: 4,
            },
            {
              name: content.founder2_name,
              role: content.founder2_role,
              bio: content.founder2_bio,
              image: '/founder-maria.jpg',
              delay: 5,
            },
          ].map((founder) => (
            <motion.div
              key={founder.name}
              variants={fadeUp}
              custom={founder.delay}
              initial="hidden"
              animate={inView ? 'visible' : 'hidden'}
              className="group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-500 hover:-translate-y-1 border border-border"
            >
              <div className="relative h-64 overflow-hidden">
                <Image
                  src={founder.image}
                  alt={founder.name || ''}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 to-transparent" />
                <div className="absolute bottom-4 left-6 right-6">
                  <h4 className="font-sans text-xl font-bold text-white">{founder.name}</h4>
                  <p className="font-body text-gold text-sm font-medium">{founder.role}</p>
                </div>
              </div>
              <div className="p-6">
                <p className="font-body text-warm-gray leading-relaxed text-sm">{founder.bio}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
