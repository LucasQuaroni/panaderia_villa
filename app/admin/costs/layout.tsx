import { requireAdmin } from '@/lib/auth/roles'

export default async function CostsGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
