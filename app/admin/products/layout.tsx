import { requireAdmin } from '@/lib/auth/roles'

export default async function ProductsGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
