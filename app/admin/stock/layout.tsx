import { requireAdmin } from '@/lib/auth/roles'

export default async function StockGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
