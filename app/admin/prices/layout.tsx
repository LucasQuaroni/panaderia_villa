import { requireAdmin } from '@/lib/auth/roles'

export default async function PricesLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return children
}
