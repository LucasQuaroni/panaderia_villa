'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useState } from 'react'
import { MapPin, Phone, Mail, Clock, Send, CheckCircle } from 'lucide-react'

interface ContactSectionProps {
  content: { [key: string]: string }
}

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: 'easeOut' },
  }),
}

export default function ContactSection({ content }: ContactSectionProps) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Error al enviar')
      setSent(true)
      setForm({ name: '', email: '', phone: '', message: '' })
    } catch {
      setError('Hubo un error al enviar el mensaje. Por favor intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const lat = parseFloat(content.map_lat || '-34.6037')
  const lng = parseFloat(content.map_lng || '-58.3816')
  const mapSrc = `https://maps.google.com/maps?q=${lat},${lng}&z=${content.map_zoom || 15}&output=embed`

  return (
    <section ref={ref} id="contacto" className="section-padding bg-charcoal relative overflow-hidden">
      {/* Background accents */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-burgundy/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold/10 rounded-full translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="text-center mb-16"
        >
          <span className="text-gold font-body text-sm tracking-[0.25em] uppercase font-semibold">
            Estamos para vos
          </span>
          <h2 className="font-sans text-4xl md:text-5xl font-bold text-cream mt-2 text-balance">
            Contacto y Pedidos
          </h2>
          <div className="mx-auto mt-4 w-16 h-1 bg-burgundy rounded-full" />
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left — info + map */}
          <div className="flex flex-col gap-8">
            {/* Contact info */}
            <motion.div
              variants={fadeUp}
              custom={1}
              initial="hidden"
              animate={inView ? 'visible' : 'hidden'}
              className="grid sm:grid-cols-2 gap-4"
            >
              {[
                { icon: MapPin, label: 'Dirección', value: content.contact_address, color: 'text-gold' },
                { icon: Phone, label: 'Teléfono', value: content.contact_phone, color: 'text-gold' },
                { icon: Mail, label: 'Email', value: content.contact_email, color: 'text-gold' },
                { icon: Clock, label: 'Horarios', value: content.contact_hours, color: 'text-gold' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div className={`mt-0.5 ${color} flex-shrink-0`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="font-body text-xs text-warm-gray-light tracking-wide uppercase mb-1">{label}</div>
                    <div className="font-body text-sm text-cream leading-snug">{value}</div>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Map */}
            <motion.div
              variants={fadeUp}
              custom={2}
              initial="hidden"
              animate={inView ? 'visible' : 'hidden'}
              className="rounded-2xl overflow-hidden border border-white/10 shadow-xl flex-1 min-h-64"
            >
              <iframe
                src={mapSrc}
                width="100%"
                height="300"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación Panadería Villa"
                className="w-full h-full min-h-64"
              />
            </motion.div>
          </div>

          {/* Right — form */}
          <motion.div
            variants={fadeUp}
            custom={3}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8">
              <h3 className="font-sans text-2xl font-bold text-cream mb-2">
                Envianos tu consulta o pedido
              </h3>
              <p className="font-body text-sm text-warm-gray-light mb-8 leading-relaxed">
                Completá el formulario y te respondemos a la brevedad. También podés indicar qué productos te interesan.
              </p>

              {sent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-12 gap-4 text-center"
                >
                  <CheckCircle size={56} className="text-gold" />
                  <h4 className="font-sans text-xl font-bold text-cream">¡Mensaje enviado!</h4>
                  <p className="font-body text-warm-gray-light text-sm">
                    Gracias por contactarnos. Te responderemos pronto.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-4 px-6 py-2.5 border border-white/20 text-cream rounded-full font-body text-sm hover:bg-white/10 transition-colors"
                  >
                    Enviar otro mensaje
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">
                        Nombre *
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Tu nombre"
                        className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="Tu teléfono"
                        className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">
                      Email *
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="tu@email.com"
                      className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">
                      Mensaje / Pedido *
                    </label>
                    <textarea
                      name="message"
                      required
                      value={form.message}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Contanos qué necesitás..."
                      className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors resize-none"
                    />
                  </div>

                  {error && (
                    <p className="font-body text-sm text-red-400">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-burgundy hover:bg-burgundy-dark text-cream font-body font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-100 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? (
                      <span className="animate-spin border-2 border-cream/30 border-t-cream rounded-full w-4 h-4" />
                    ) : (
                      <Send size={16} />
                    )}
                    {loading ? 'Enviando...' : 'Enviar Mensaje'}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
