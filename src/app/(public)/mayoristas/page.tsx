import { Suspense } from 'react'
import { db } from '@/lib/db'
import { getWholesaleAccess } from '@/lib/wholesale'
import { WholesaleCodeForm } from '@/components/WholesaleCodeForm'
import { WholesaleTable } from '@/components/WholesaleTable'

export const metadata = { title: 'Precios mayoristas · Serena Mia' }

async function WholesaleList() {
  const access = await getWholesaleAccess()
  if (!access.visible) {
    return (
      <section className="flex flex-col gap-4 rounded-2xl bg-blush p-5">
        <p className="text-base">
          Los precios mayoristas son para salones. Si tenés el código que te dio Serena Mia, ingresalo acá y se
          activan los precios.
        </p>
        <WholesaleCodeForm variant="page" />
      </section>
    )
  }
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
    select: { id: true, name: true, stock: true, retailPrice: true, wholesalePrice: true, wholesaleMinQty: true },
  })
  if (products.length === 0) return <p className="rounded-2xl bg-blush p-6 text-center text-base">Todavía no hay productos cargados.</p>
  return <WholesaleTable rows={products} />
}

export default function WholesalePage() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-script text-3xl font-bold text-brand-ink">Lista mayorista</h2>
      <p className="text-base text-muted">
        Elegí la cantidad de cada producto. El precio mayorista se aplica cuando llegás a la cantidad mínima.
      </p>
      <Suspense fallback={<p className="py-10 text-center text-muted">Cargando lista…</p>}>
        <WholesaleList />
      </Suspense>
    </div>
  )
}
