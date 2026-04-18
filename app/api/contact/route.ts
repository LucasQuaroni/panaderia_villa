import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, phone, message } = body

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase.from('contact_messages').insert({
      name,
      email,
      phone: phone || null,
      message,
    })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[contact API]', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
