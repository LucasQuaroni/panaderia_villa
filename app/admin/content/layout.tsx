import { requireAdmin } from '@/lib/auth/roles'

export default async function ContentGuardLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}
