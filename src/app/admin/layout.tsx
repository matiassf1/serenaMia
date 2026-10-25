import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getCurrentAdmin } from '@/lib/auth'
import AdminNav from './AdminNav'

export const metadata: Metadata = {
  title: 'Serena Mia · Admin',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#FFF7FB] text-[#1A1218]">
      {/* La sesión se lee de cookies (dato de runtime): va dentro de Suspense por cacheComponents. */}
      <Suspense fallback={null}>
        <AdminChrome>{children}</AdminChrome>
      </Suspense>
    </div>
  )
}

// El proxy ya redirige a quien no tiene sesión; sin sesión (login) se muestra solo el contenido.
async function AdminChrome({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin()
  if (!admin) return <>{children}</>

  return (
    <div className="flex min-h-dvh flex-col md:flex-row-reverse">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#7A4FA0]/20 bg-white px-4 py-2">
          <span className="text-lg font-bold text-[#C2398C]">Serena Mia</span>
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="min-h-11 rounded-lg px-3 text-sm font-semibold text-[#7A4FA0] underline"
            >
              Cerrar sesión
            </button>
          </form>
        </header>
        <div className="flex-1 px-4 py-4 pb-24 md:pb-4">{children}</div>
      </div>
      <AdminNav />
    </div>
  )
}
