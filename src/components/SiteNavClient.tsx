'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BagIcon, GridIcon, TagIcon, TruckIcon } from './icons'
import { CartButton } from './CartButton'

const LINKS = [
  { href: '/', label: 'Catálogo', Icon: GridIcon },
  { href: '/mayoristas', label: 'Mayoristas', Icon: TagIcon },
  { href: '/seguimiento', label: 'Mi pedido', Icon: TruckIcon },
] as const

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/categoria')
  return pathname.startsWith(href)
}

function StatusDot({ open, label }: { open: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-block size-2.5 rounded-full ${open ? 'animate-pulse-dot bg-green-500' : 'bg-gray-400'}`}
    />
  )
}

export function SiteNavClient({ name, open, statusLabel }: { name: string; open: boolean; statusLabel: string }) {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  // En PC, en la portada el nombre ya está enorme en el hero: la marca de la barra aparece recién al bajar (en celular la barra no cambia de alto, para no mover el contenido).
  const hideBrand = pathname === '/' && !pastHero

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8)
      setPastHero(window.scrollY > 220)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <header
        className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-300 ${
          scrolled ? 'border-blush-border bg-white/85 shadow-sm backdrop-blur-xl' : 'border-transparent bg-white/60 backdrop-blur-md'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:h-16 md:px-8">
          <Link href="/" aria-label={`${name}: ir al inicio`} className={`group flex items-center gap-3 transition-all duration-300 ${hideBrand ? 'md:pointer-events-none md:-translate-y-1 md:opacity-0' : ''}`}>
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full ring-2 ring-blush-border transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105"
            />
            <span className="font-script text-2xl font-bold leading-none text-brand-ink">{name}</span>
          </Link>

          <span className="ml-1 flex items-center md:hidden">
            <StatusDot open={open} label={statusLabel} />
          </span>

          <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label }) => {
              const active = isActive(pathname, href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-h-11 items-center rounded-full px-4 text-base font-semibold transition-colors ${
                    active ? 'bg-blush text-brand-ink' : 'text-foreground hover:bg-blush hover:text-brand-ink'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto hidden items-center gap-4 md:flex">
            <span className="flex items-center gap-2 text-sm font-medium text-muted">
              <StatusDot open={open} label={statusLabel} />
              <span aria-hidden>{open ? 'Abierto ahora' : 'Cerrado'}</span>
            </span>
            <CartButton className="flex min-h-11 items-center gap-2 rounded-full bg-brand-deep px-5 text-base font-semibold text-white shadow-md shadow-brand/30 transition hover:-translate-y-0.5 hover:bg-brand-ink active:translate-y-0">
              {(count) => (
                <>
                  <BagIcon className="size-5" />
                  <span>Carrito</span>
                  {count > 0 && (
                    <span className="min-w-6 rounded-full bg-white px-1.5 text-center text-sm font-bold text-brand-ink">{count}</span>
                  )}
                </>
              )}
            </CartButton>
          </div>
        </div>
      </header>

      {/* Celular: barra inferior de pulgar, siempre a mano. */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-blush-border bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {LINKS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                    active ? 'text-brand-ink' : 'text-muted'
                  }`}
                >
                  <span className={`rounded-full px-4 py-1 transition-colors ${active ? 'bg-blush' : ''}`}>
                    <Icon className="size-6" />
                  </span>
                  {label}
                </Link>
              </li>
            )
          })}
          <li>
            <CartButton className="flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted">
              {(count) => (
                <>
                  <span className="relative rounded-full px-4 py-1">
                    <BagIcon className="size-6" />
                    {count > 0 && (
                      <span className="absolute -right-0.5 -top-1 min-w-5 rounded-full bg-brand-deep px-1 text-center text-xs font-bold text-white">
                        {count}
                      </span>
                    )}
                  </span>
                  Carrito
                </>
              )}
            </CartButton>
          </li>
        </ul>
      </nav>
    </>
  )
}
