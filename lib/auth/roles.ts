import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'admin' | 'cashier' | null

/**
 * Devuelve el rol del usuario logueado leyéndolo de public.user_roles.
 * - 'admin'   → acceso total
 * - 'cashier' → acceso limitado (precios y, en el futuro, ventas)
 * - null      → no logueado o sin rol asignado (se trata como mínimo privilegio)
 */
export async function getUserRole(): Promise<Role> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  return (data?.role as Role) ?? null
}

/** true solo si el usuario tiene rol admin. */
export async function isAdmin(): Promise<boolean> {
  return (await getUserRole()) === 'admin'
}

/**
 * Guard para páginas/secciones solo-admin.
 * Si el usuario no es admin, lo manda al dashboard.
 * Usar en un layout.tsx (server) de la ruta protegida.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    redirect('/admin')
  }
}
