import { Suspense } from 'react'
import { CartProvider } from '@/components/CartProvider'
import { CartDrawer } from '@/components/CartDrawer'
import { StoreHeader, StoreHeaderSkeleton } from '@/components/StoreHeader'

export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <CartProvider>
      <Suspense fallback={<StoreHeaderSkeleton />}>
        <StoreHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-5">{children}</main>
      <footer className="border-t border-blush-border bg-blush px-4 py-6 text-center text-sm text-muted">
        Serena Mia · Estética &amp; Insumos · San Miguel de Tucumán
      </footer>
      <CartDrawer />
    </CartProvider>
  )
}
