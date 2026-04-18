'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, CheckCircle } from 'lucide-react'

const SECTIONS: { title: string; keys: { key: string; label: string; multiline?: boolean }[] }[] = [
  {
    title: 'Hero principal',
    keys: [
      { key: 'hero_title', label: 'Título principal' },
      { key: 'hero_subtitle', label: 'Subtítulo' },
    ],
  },
  {
    title: 'Sección Nosotros',
    keys: [
      { key: 'about_title', label: 'Título' },
      { key: 'about_body', label: 'Descripción', multiline: true },
      { key: 'founder1_name', label: 'Fundador 1 — Nombre' },
      { key: 'founder1_role', label: 'Fundador 1 — Rol' },
      { key: 'founder1_bio', label: 'Fundador 1 — Bio', multiline: true },
      { key: 'founder2_name', label: 'Fundador 2 — Nombre' },
      { key: 'founder2_role', label: 'Fundador 2 — Rol' },
      { key: 'founder2_bio', label: 'Fundador 2 — Bio', multiline: true },
    ],
  },
  {
    title: 'Contacto',
    keys: [
      { key: 'contact_address', label: 'Dirección' },
      { key: 'contact_phone', label: 'Teléfono' },
      { key: 'contact_email', label: 'Email' },
      { key: 'contact_hours', label: 'Horarios' },
    ],
  },
  {
    title: 'Mapa',
    keys: [
      { key: 'map_lat', label: 'Latitud' },
      { key: 'map_lng', label: 'Longitud' },
      { key: 'map_zoom', label: 'Zoom (1-20)' },
    ],
  },
]

export default function AdminContentPage() {
  const supabase = createClient()
  const [content, setContent] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const fetchContent = async () => {
    const { data } = await supabase.from('site_content').select('key, value')
    const map: Record<string, string> = {}
    for (const row of data ?? []) map[row.key] = row.value
    setContent(map)
    setLoading(false)
  }

  useEffect(() => { fetchContent() }, [])

  const handleChange = (key: string, value: string) => {
    setContent(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    const upserts = Object.entries(content).map(([key, value]) => ({ key, value }))
    await supabase.from('site_content').upsert(upserts, { onConflict: 'key' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-sans text-3xl font-bold text-charcoal">Contenido del sitio</h1>
          <p className="font-body text-warm-gray mt-1">Editá los textos e información que se muestran al público.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-burgundy text-cream rounded-xl font-body text-sm font-semibold hover:bg-burgundy-dark disabled:opacity-60 transition-colors shadow-md"
        >
          {saved ? <CheckCircle size={16} /> : saving ? <span className="animate-spin border-2 border-cream/30 border-t-cream rounded-full w-4 h-4" /> : <Save size={16} />}
          {saved ? '¡Guardado!' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-warm-gray font-body">Cargando...</div>
      ) : (
        <div className="flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <div key={section.title} className="bg-white rounded-2xl border border-border shadow-sm p-6">
              <h2 className="font-sans text-lg font-bold text-charcoal mb-5 pb-3 border-b border-border">
                {section.title}
              </h2>
              <div className="flex flex-col gap-4">
                {section.keys.map(({ key, label, multiline }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="font-body text-xs text-warm-gray uppercase tracking-wide">{label}</label>
                    {multiline ? (
                      <textarea
                        value={content[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        rows={3}
                        className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy transition-colors resize-none text-charcoal"
                      />
                    ) : (
                      <input
                        type="text"
                        value={content[key] ?? ''}
                        onChange={(e) => handleChange(key, e.target.value)}
                        className="px-3 py-2.5 border border-border rounded-lg font-body text-sm focus:outline-none focus:border-burgundy transition-colors text-charcoal"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
