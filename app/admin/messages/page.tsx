'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mail, MailOpen, Trash2, Phone } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Message {
  id: string
  name: string
  email: string
  phone: string | null
  message: string
  read: boolean
  created_at: string
}

export default function AdminMessagesPage() {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Message | null>(null)

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
    setMessages(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchMessages() }, [])

  const markRead = async (msg: Message) => {
    if (!msg.read) {
      await supabase.from('contact_messages').update({ read: true }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m))
    }
    setSelected(msg)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este mensaje?')) return
    await supabase.from('contact_messages').delete().eq('id', id)
    setMessages(prev => prev.filter(m => m.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const unreadCount = messages.filter(m => !m.read).length

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-sans text-3xl font-bold text-charcoal">Mensajes</h1>
        <p className="font-body text-warm-gray mt-1">
          {unreadCount > 0 ? `${unreadCount} mensajes sin leer` : 'Todos los mensajes leídos'}
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-warm-gray font-body text-sm">Cargando...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-warm-gray font-body text-sm">No hay mensajes.</div>
          ) : (
            <ul>
              {messages.map((msg, i) => (
                <li key={msg.id}>
                  {i > 0 && <div className="h-px bg-border mx-4" />}
                  <button
                    onClick={() => markRead(msg)}
                    className={`w-full text-left px-4 py-4 hover:bg-cream-dark transition-colors ${selected?.id === msg.id ? 'bg-cream-dark' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex-shrink-0">
                        {msg.read
                          ? <MailOpen size={16} className="text-warm-gray" />
                          : <Mail size={16} className="text-burgundy" />}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-body text-sm truncate ${msg.read ? 'text-warm-gray' : 'font-semibold text-charcoal'}`}>
                          {msg.name}
                        </div>
                        <div className="font-body text-xs text-warm-gray truncate">{msg.message}</div>
                        <div className="font-body text-xs text-warm-gray/60 mt-1">
                          {format(new Date(msg.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="font-sans text-xl font-bold text-charcoal">{selected.name}</h2>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 font-body text-sm text-burgundy hover:underline">
                      <Mail size={14} /> {selected.email}
                    </a>
                    {selected.phone && (
                      <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 font-body text-sm text-warm-gray hover:text-charcoal">
                        <Phone size={14} /> {selected.phone}
                      </a>
                    )}
                  </div>
                  <p className="font-body text-xs text-warm-gray/60 mt-1">
                    {format(new Date(selected.created_at), "EEEE d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(selected.id)}
                  className="p-2 text-warm-gray hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="bg-cream-dark rounded-xl p-4 font-body text-sm text-charcoal leading-relaxed whitespace-pre-wrap">
                {selected.message}
              </div>
              <a
                href={`mailto:${selected.email}?subject=Re: Consulta Panadería Villa`}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark transition-colors"
              >
                <Mail size={15} /> Responder por email
              </a>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-2xl border border-border shadow-sm p-12 text-center">
              <div>
                <Mail size={40} className="text-warm-gray-light mx-auto mb-3" />
                <p className="font-body text-warm-gray text-sm">Seleccioná un mensaje para leerlo</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
