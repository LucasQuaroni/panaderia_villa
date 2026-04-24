'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Eye, EyeOff, LogIn } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Credenciales incorrectas. Verificá tu email y contraseña.')
      setLoading(false)
    } else {
      router.push('/admin')
    }
  }

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      {/* Background accent */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-burgundy/20 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold/10 rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Image
              src="/logo-final.png"
              alt="Villa"
              width={2048}
              height={2048}
              priority
              className="object-contain h-14 w-auto"
            />
            <h1 className="font-sans text-2xl font-bold text-cream mt-4">Panel de Administración</h1>
            <p className="font-body text-sm text-warm-gray-light mt-1">Ingresá con tus credenciales</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@panaderiavilla.com"
                className="px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-body text-xs text-warm-gray-light uppercase tracking-wide">Contraseña</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 rounded-xl bg-white/10 border border-white/20 text-cream placeholder:text-warm-gray font-body text-sm focus:outline-none focus:border-gold transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-cream transition-colors"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && <p className="font-body text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 mt-2 px-6 py-4 bg-burgundy hover:bg-burgundy-dark text-cream font-body font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="animate-spin border-2 border-cream/30 border-t-cream rounded-full w-4 h-4" />
              ) : (
                <LogIn size={16} />
              )}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-center font-body text-xs text-warm-gray mt-4">
          Para crear tu cuenta de administrador, usá el panel de Supabase.
        </p>
      </div>
    </div>
  )
}
