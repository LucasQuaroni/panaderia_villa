'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Package, Users, MessageSquare, Calculator,
  FileText, LogOut, Menu, X, ChevronRight, ShoppingBag, Printer,
} from 'lucide-react'

type Role = 'admin' | 'cashier' | null

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, adminOnly: false },
  { href: '/admin/prices', label: 'Lista de Precios', icon: Printer, adminOnly: false },
  { href: '/admin/products', label: 'Productos', icon: Package, adminOnly: true },
  { href: '/admin/content', label: 'Contenido', icon: FileText, adminOnly: true },
  { href: '/admin/messages', label: 'Mensajes', icon: MessageSquare, adminOnly: true },
  { href: '/admin/orders', label: 'Pedidos', icon: ShoppingBag, adminOnly: true },
  { href: '/admin/costs', label: 'Calculadora de Costos', icon: Calculator, adminOnly: true },
]

export default function AdminShell({ children, role }: { children: React.ReactNode; role?: Role }) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isAdmin = role === 'admin'
  const visibleNavItems = navItems.filter((item) => isAdmin || !item.adminOnly)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

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
        {visibleNavItems.map(({ href, label, icon: Icon, exact }) => {
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
        })}
        {!isAdmin && (
          <div className="mt-2 mx-1 px-3 py-3 rounded-xl bg-sidebar-accent/30 text-sidebar-foreground/60 font-body text-xs leading-relaxed">
            El módulo de ventas estará disponible próximamente.
          </div>
        )}
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
