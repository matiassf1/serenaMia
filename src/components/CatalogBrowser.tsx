'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ProductCard } from './ProductCard'
import { SearchIcon, CloseIcon, WhatsappIcon } from './icons'
import type { CatalogProduct } from '@/lib/catalog'

type Cat = { id: number; name: string; slug: string }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

/**
 * Catálogo con filtro en el cliente: cambiar de categoría o buscar no recarga nada, solo reacomoda las tarjetas
 * con una entrada suave. Los datos (ya filtrados por permiso mayorista) llegan una sola vez desde el servidor.
 */
export function CatalogBrowser({
  categories,
  products,
  initialSlug = null,
  initialQuery = '',
  whatsappHref,
}: {
  categories: Cat[]
  products: CatalogProduct[]
  initialSlug?: string | null
  initialQuery?: string
  whatsappHref: string
}) {
  const [slug, setSlug] = useState<string | null>(initialSlug)
  const [q, setQ] = useState(initialQuery)
  // La entrada animada solo después de la primera interacción: la carga inicial no parpadea.
  const [animate, setAnimate] = useState(false)

  const active = categories.find((c) => c.slug === slug) ?? null
  const term = norm(q)
  const visible = useMemo(
    () =>
      products.filter(
        (p) => (!active || p.categoryId === active.id) && (!term || norm(p.name).includes(term)),
      ),
    [products, active, term],
  )

  function syncUrl(nextSlug: string | null, nextQ: string) {
    const qs = nextQ.trim() ? `?q=${encodeURIComponent(nextQ.trim())}` : ''
    window.history.replaceState(null, '', `${nextSlug ? `/categoria/${nextSlug}` : '/'}${qs}`)
  }

  function pick(next: string | null) {
    setAnimate(true)
    setSlug(next)
    syncUrl(next, q)
  }

  function search(next: string) {
    setAnimate(true)
    setQ(next)
    syncUrl(slug, next)
  }

  const chip = (isActive: boolean) =>
    `flex min-h-12 items-center rounded-full border-2 px-5 text-base font-semibold transition-all duration-300 ${
      isActive
        ? 'border-brand-deep bg-brand-deep text-white shadow-md shadow-brand/30'
        : 'border-blush-border bg-white text-brand-ink hover:border-brand hover:bg-blush'
    }`

  const heading = term ? `Resultados para “${q.trim()}”` : active ? active.name : 'Nuestros productos'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Categorías">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link
                href="/"
                aria-current={active ? undefined : 'page'}
                onClick={(e) => {
                  e.preventDefault()
                  pick(null)
                }}
                className={chip(!active)}
              >
                Todo
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categoria/${c.slug}`}
                  aria-current={c.slug === slug ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    pick(c.slug)
                  }}
                  className={chip(c.slug === slug)}
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form role="search" onSubmit={(e) => e.preventDefault()} className="relative lg:w-96">
          <label htmlFor="q" className="sr-only">
            Buscar productos
          </label>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id="q"
            name="q"
            type="search"
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar productos"
            autoComplete="off"
            className="min-h-12 w-full rounded-full border-2 border-blush-border bg-white pl-12 pr-12 text-base shadow-sm transition placeholder:text-muted focus:border-brand-deep"
          />
          {q && (
            <button
              type="button"
              onClick={() => search('')}
              aria-label="Borrar búsqueda"
              className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-blush"
            >
              <CloseIcon className="size-5" />
            </button>
          )}
        </form>
      </div>

      <h2 className="font-script text-4xl font-bold text-brand-ink">{heading}</h2>

      {visible.length === 0 ? (
        products.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl bg-blush p-8 text-center">
            <p className="text-lg font-medium">Estamos cargando el catálogo. ¡Muy pronto vas a ver todo acá!</p>
            <p className="text-base text-muted">Mientras tanto, escribinos y te contamos qué tenemos.</p>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center gap-2 rounded-full bg-brand-deep px-6 text-base font-semibold text-white shadow-lg shadow-brand/30"
            >
              <WhatsappIcon className="size-5" /> Escribir por WhatsApp
            </a>
          </div>
        ) : (
          <p className="rounded-3xl bg-blush p-8 text-center text-base">
            No encontramos productos{term ? ` para “${q.trim()}”` : active ? ` en ${active.name}` : ''}. Probá con otra palabra o mirá todo el
            catálogo.
          </p>
        )
      ) : (
        <ul
          key={`${slug ?? 'todo'}|${term}`}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 xl:gap-6"
        >
          {visible.map((p, i) => (
            <ProductCard key={p.id} product={p} enterDelayMs={animate ? Math.min(i, 11) * 45 : undefined} />
          ))}
        </ul>
      )}
    </div>
  )
}
