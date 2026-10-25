import Link from 'next/link'

type Cat = { id: number; name: string; slug: string }

export function CategoryNav({ categories, activeSlug }: { categories: Cat[]; activeSlug?: string }) {
  const chip = 'flex min-h-12 items-center rounded-full border-2 px-5 text-base font-semibold'
  return (
    <nav aria-label="Categorías">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href="/"
            aria-current={activeSlug ? undefined : 'page'}
            className={`${chip} ${activeSlug ? 'border-blush-border bg-white text-brand-ink' : 'border-brand-deep bg-brand-deep text-white'}`}
          >
            Todo
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id}>
            <Link
              href={`/categoria/${c.slug}`}
              aria-current={c.slug === activeSlug ? 'page' : undefined}
              className={`${chip} ${c.slug === activeSlug ? 'border-brand-deep bg-brand-deep text-white' : 'border-blush-border bg-white text-brand-ink'}`}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
