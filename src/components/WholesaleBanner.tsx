import Link from 'next/link'
import { getWholesaleAccess } from '@/lib/wholesale'
import { WholesaleCodeForm } from './WholesaleCodeForm'

/** Única franja mayorista del sitio: texto del admin (StoreSettings.wholesaleBanner) + acceso al código o a la lista. Necesita <Suspense> (lee cookies). */
export async function WholesaleBanner() {
  const a = await getWholesaleAccess()
  const locked = a.mode === 'CODE' && !a.unlocked
  if (!a.banner && !locked && !a.visible) return null

  return (
    <section aria-label="Precios mayoristas" className="bg-violet px-4 py-1.5 text-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 text-center text-sm font-medium">
        {a.banner && <p className="py-1.5">{a.banner}</p>}
        {a.mode === 'CODE' && a.unlocked && <p className="py-1.5 font-semibold">Precios mayoristas activados ✓</p>}
        {locked ? (
          <WholesaleCodeForm variant="banner" />
        ) : (
          <Link href="/mayoristas" className="flex min-h-11 items-center px-2 font-semibold underline underline-offset-2">
            Ver lista mayorista
          </Link>
        )}
      </div>
    </section>
  )
}
