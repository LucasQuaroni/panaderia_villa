import { requireAdmin } from '@/lib/auth/roles'

export default async function SueldosGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
