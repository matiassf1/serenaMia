'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export type FormProduct = {
  id: number
  name: string
  description: string
  categoryId: number
  retailPrice: string
  wholesalePrice: string
  wholesaleMinQty: string
  stock: number
  lowStockThreshold: number
  active: boolean
  imagePath: string | null
}

const field =
  'mt-1 block min-h-12 w-full rounded-xl border border-[#7A4FA0]/40 bg-white px-4 text-base text-[#1A1218] focus:border-[#C2398C]'
const label = 'block text-base font-medium'
const hint = 'mt-1 block text-sm text-[#4A3A52]'

export default function ProductForm({
  categories,
  product,
}: {
  categories: { id: number; name: string }[]
  product?: FormProduct
}) {
  const router = useRouter()
  const [error, setError] = useState<{ text: string; field?: string } | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      const res = await fetch('/api/admin/products', { method: 'POST', body: new FormData(e.currentTarget) })
      if (res.ok) {
        router.push('/admin/productos')
        router.refresh()
        return
      }
      const data = await res.json().catch(() => null)
      setError({ text: data?.error ?? 'No se pudo guardar. Probá de nuevo.', field: data?.field })
    } catch {
      setError({ text: 'No se pudo conectar. Revisá tu conexión.' })
    }
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" encType="multipart/form-data">
      {product && <input type="hidden" name="id" value={product.id} />}
      <label className={label}>
        Nombre
        <input name="name" required maxLength={120} defaultValue={product?.name} className={field} />
      </label>
      <label className={label}>
        Categoría
        <select name="categoryId" required defaultValue={product?.categoryId ?? ''} className={field}>
          <option value="" disabled>
            Elegí una categoría
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <label className={label}>
          Precio
          <input name="retailPrice" required inputMode="decimal" placeholder="1.500,00" defaultValue={product?.retailPrice} aria-describedby="hint-price" className={field} />
        </label>
        <span id="hint-price" className={hint}>En pesos. Ejemplo: 1.500,00</span>
      </div>
      <fieldset className="rounded-2xl border border-[#7A4FA0]/30 p-4">
        <legend className="px-2 text-base font-semibold text-[#7A4FA0]">Precio mayorista (opcional)</legend>
        <label className={label}>
          Precio mayorista
          <input name="wholesalePrice" inputMode="decimal" placeholder="1.200,00" defaultValue={product?.wholesalePrice} className={field} />
        </label>
        <div className="mt-3">
          <label className={label}>
            Cantidad mínima para el precio mayorista
            <input name="wholesaleMinQty" inputMode="numeric" placeholder="6" defaultValue={product?.wholesaleMinQty} aria-describedby="hint-wholesale" className={field} />
          </label>
          <span id="hint-wholesale" className={hint}>Completá los dos o dejá los dos vacíos.</span>
        </div>
      </fieldset>
      <label className={label}>
        Cantidad disponible (stock)
        <input name="stock" required inputMode="numeric" defaultValue={product?.stock ?? 0} className={field} />
      </label>
      <div>
        <label className={label}>
          Avisarme cuando queden pocas unidades
          <input name="lowStockThreshold" inputMode="numeric" defaultValue={product?.lowStockThreshold ?? 3} aria-describedby="hint-low" className={field} />
        </label>
        <span id="hint-low" className={hint}>Si el stock llega a este número o menos, aparece un aviso.</span>
      </div>
      <label className={label}>
        Descripción (opcional)
        <textarea name="description" rows={3} defaultValue={product?.description} className={`${field} py-3`} />
      </label>
      <div>
        <label className={label}>
          Foto (JPG, PNG o WebP, hasta 5 MB)
          <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className={`${field} py-3`} />
        </label>
        {product?.imagePath && (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/uploads/${product.imagePath}`} alt="Foto actual" className="size-20 rounded-xl object-cover" />
            <label className="flex min-h-12 items-center gap-2 text-base">
              <input type="checkbox" name="removeImage" className="size-6" /> Quitar foto
            </label>
          </div>
        )}
      </div>
      <label className="flex min-h-12 items-center gap-3 text-base font-medium">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="size-6" />
        Mostrar en la tienda
      </label>
      {error && (
        <p role="alert" data-field={error.field} className="rounded-xl bg-[#FDECF5] px-4 py-3 text-base font-medium text-[#8A1F60]">
          {error.text}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-[#C2398C] px-4 text-base font-semibold text-white disabled:opacity-60">
        {pending ? 'Guardando…' : 'Guardar producto'}
      </button>
    </form>
  )
}
