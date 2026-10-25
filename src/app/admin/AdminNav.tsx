'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/admin/pedidos', label: 'Pedidos' },
  { href: '/admin/productos', label: 'Productos' },
  { href: '/admin/ajustes', label: 'Ajustes' },
]

export default function AdminNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Panel"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-[#7A4FA0]/20 bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-r md:pb-0"
    >
      <ul className="flex md:flex-col">
        {ITEMS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 items-center justify-center px-4 text-sm font-semibold md:justify-start md:px-6 ${
                  active ? 'bg-[#FDECF5] text-[#C2398C]' : 'text-[#4A3A52]'
                }`}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
