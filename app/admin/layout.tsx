import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminShell from '@/components/admin/AdminShell'
import ServiceWorkerRegister from '@/components/admin/ServiceWorkerRegister'
import { getUserRole } from '@/lib/auth/roles'
import { ScaleProvider } from '@/hooks/use-scale'

export const metadata = {
  title: 'Admin — Panadería Villa',
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getUserRole()

  return (
    <>
      <ServiceWorkerRegister />
      <ScaleProvider><AdminShell role={role}>{children}</AdminShell></ScaleProvider>
    </>
  )
}
