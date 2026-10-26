import { Suspense } from 'react'
import { CartProvider } from '@/components/CartProvider'
import { CartDrawer } from '@/components/CartDrawer'
import { SiteFooter, SiteFooterSkeleton } from '@/components/SiteFooter'
import { SiteNav, SiteNavSkeleton } from '@/components/SiteNav'

export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <CartProvider>
      <Suspense fallback={<SiteNavSkeleton />}>
        <SiteNav />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Suspense fallback={<SiteFooterSkeleton />}>
        <SiteFooter />
      </Suspense>
      <CartDrawer />
    </CartProvider>
  )
}
