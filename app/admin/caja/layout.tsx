import { requireAdmin } from '@/lib/auth/roles'

export default async function CajaGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
