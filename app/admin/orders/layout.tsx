import { requireAdmin } from '@/lib/auth/roles'

export default async function OrdersGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
