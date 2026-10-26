import Link from 'next/link'
import { ArrowLeftIcon } from './icons'

/** Camino de vuelta explícito en las páginas secundarias (mayoristas, seguimiento, checkout, pedido). */
export function BackLink({ href = '/', children = 'Volver al catálogo' }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 w-fit items-center gap-2 rounded-full pr-3 text-base font-semibold text-brand-ink hover:underline"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-blush transition-transform group-hover:-translate-x-0.5">
        <ArrowLeftIcon className="size-5" />
      </span>
      {children}
    </Link>
  )
}
