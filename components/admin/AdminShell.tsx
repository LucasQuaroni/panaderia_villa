'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Package, Users, MessageSquare, Calculator,
  FileText, LogOut, Menu, X, ChevronRight, ChevronDown, ShoppingBag, Printer, ShoppingCart, Wallet, Boxes, Receipt, Store, ReceiptText, IdCard,
  History, ClipboardCheck, type LucideIcon,
} from 'lucide-react'

type Role = 'admin' | 'cashier' | null
type NavLink = { href: string; label: string; icon: LucideIcon; adminOnly: boolean; exact?: boolean }
type NavItem = NavLink & { children?: NavLink[] }

const dashboardItem = { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, adminOnly: true }
const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'WEB',
    items: [
      { href: '/admin/content', label: 'Contenido', icon: FileText, adminOnly: true },
      { href: '/admin/messages', label: 'Mensajes', icon: MessageSquare, adminOnly: true },
      { href: '/admin/orders', label: 'Pedidos', icon: ShoppingBag, adminOnly: true },
    ],
  },
  {
    label: 'PRODUCCIÓN',
    items: [
      { href: '/admin/products', label: 'Productos', icon: Package, adminOnly: true },
      { href: '/admin/costs', label: 'Calculadora de Costos', icon: Calculator, adminOnly: true },
      {
        href: '/admin/stock', label: 'Stock', icon: Boxes, adminOnly: true,
        children: [
          { href: '/admin/stock', label: 'Stock actual', icon: Boxes, adminOnly: true, exact: true },
          { href: '/admin/stock/historial', label: 'Historial de stock', icon: History, adminOnly: true },
          { href: '/admin/stock/registro', label: 'Registro de ventas y descuentos', icon: ClipboardCheck, adminOnly: true },
        ],
      },
    ],
  },
  {
    label: 'VENTAS',
    items: [
      { href: '/admin/pos', label: 'Mostrador minorista', icon: ShoppingCart, adminOnly: false },
      { href: '/admin/wholesale', label: 'Mostrador mayorista', icon: Store, adminOnly: false },
      { href: '/admin/fiados', label: 'Fiados', icon: Wallet, adminOnly: false },
      { href: '/admin/prices', label: 'Lista de Precios', icon: Printer, adminOnly: true },
      { href: '/admin/ventas', label: 'Ventas', icon: Receipt, adminOnly: true },
      { href: '/admin/caja', label: 'Historial de Caja', icon: Wallet, adminOnly: true },
    ],
  },
  {
    label: 'ADMINISTRACIÓN',
    items: [
      { href: '/admin/gastos', label: 'Gastos', icon: ReceiptText, adminOnly: true },
      { href: '/admin/sueldos', label: 'Empleados y sueldos', icon: IdCard, adminOnly: true },
    ],
  },
]

export default function AdminShell({ children, role }: { children: React.ReactNode; role?: Role }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Grupos con submenú desplegados. El grupo de la página actual se abre solo.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  const isAdmin = role === 'admin'
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  useEffect(() => {
    const current = navSections.flatMap((section) => section.items)
      .find((item) => item.children && isActive(item.href))
    if (current) setOpenGroups((previous) => previous.has(current.href) ? previous : new Set(previous).add(current.href))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  const toggleGroup = (href: string) => setOpenGroups((previous) => {
    const next = new Set(previous)
    if (next.has(href)) next.delete(href)
    else next.add(href)
    return next
  })

  const linkClass = (active: boolean) => `flex items-center gap-3 px-3 py-2.5 rounded-xl font-body text-sm font-medium transition-all duration-200 group ${active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <Image
            src="/logo-final.png"
            alt="Villa"
            width={2048}
            height={2048}
            className="object-contain h-9 w-auto"
          />
          <div>
            <div className="text-xs text-sidebar-foreground/60 font-body">Panel de</div>
            <div className="text-sm font-semibold text-sidebar-foreground font-sans">
              {isAdmin ? 'Administración' : 'Atención'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
        {isAdmin && (() => {
          const { href, label, icon: Icon, exact } = dashboardItem
          const active = isActive(href, exact)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-body text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
            >
              <Icon size={18} className={active ? 'text-sidebar-primary' : 'group-hover:text-sidebar-primary transition-colors'} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto text-sidebar-primary" />}
            </Link>
          )
        })()}
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => isAdmin || !item.adminOnly)
          if (visibleItems.length === 0) return null
          return (
            <div key={section.label} className="mt-3 first:mt-1">
              <div className="px-3 pb-1.5 font-body text-[10px] font-bold tracking-[0.16em] text-sidebar-foreground/40">{section.label}</div>
              <div className="flex flex-col gap-1">
                {visibleItems.map(({ href, label, icon: Icon, exact, children }) => {
                  const visibleChildren = children?.filter((child) => isAdmin || !child.adminOnly) ?? []
                  if (visibleChildren.length > 0) {
                    const groupActive = isActive(href)
                    const expanded = openGroups.has(href)
                    return (
                      <div key={href} className="flex flex-col gap-1">
                        <button type="button" onClick={() => toggleGroup(href)} aria-expanded={expanded} className={`${linkClass(false)} w-full text-left ${groupActive ? '!text-sidebar-foreground' : ''}`}>
                          <Icon size={18} className={groupActive ? 'text-sidebar-primary' : 'group-hover:text-sidebar-primary transition-colors'} />
                          {label}
                          <ChevronDown size={14} className={`ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="ml-5 pl-2 border-l border-sidebar-border flex flex-col gap-0.5">
                            {visibleChildren.map((child) => {
                              const ChildIcon = child.icon
                              const active = isActive(child.href, child.exact)
                              return (
                                <Link key={child.href} href={child.href} onClick={() => setSidebarOpen(false)} className={`${linkClass(active)} !py-2 !text-[13px]`}>
                                  <ChildIcon size={15} className={`shrink-0 ${active ? 'text-sidebar-primary' : 'group-hover:text-sidebar-primary transition-colors'}`} />
                                  <span className="leading-tight">{child.label}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  }
                  const active = isActive(href, exact)
                  return (
                    <Link key={href} href={href} onClick={() => setSidebarOpen(false)} className={linkClass(active)}>
                      <Icon size={18} className={active ? 'text-sidebar-primary' : 'group-hover:text-sidebar-primary transition-colors'} />
                      {label}
                      {active && <ChevronRight size={14} className="ml-auto text-sidebar-primary" />}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Links de vista pública + logout */}
      <div className="p-4 border-t border-sidebar-border flex flex-col gap-2">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-body text-xs text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 transition-colors"
        >
          <Users size={14} />
          Ver sitio público
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl font-body text-xs text-sidebar-foreground/50 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex bg-cream-dark font-body">
      {/* Desktop sidebar */}
      <aside className="no-print hidden lg:flex flex-col w-64 bg-sidebar fixed inset-y-0 left-0 z-30 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-sidebar h-full shadow-2xl">
            <button
              className="absolute top-4 right-4 text-sidebar-foreground/50 hover:text-sidebar-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 print:!ml-0 flex flex-col min-h-screen">
        {/* Top bar (mobile) */}
        <header className="no-print lg:hidden flex items-center justify-between px-4 py-3 bg-sidebar text-sidebar-foreground shadow-md">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="font-sans text-sm font-semibold">Admin Villa</span>
          <button onClick={handleLogout} className="text-sidebar-foreground/60">
            <LogOut size={18} />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
