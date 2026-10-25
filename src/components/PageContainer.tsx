import { BackLink } from './BackLink'

/** Contenedor de las páginas secundarias: ancho cómodo y camino de vuelta al catálogo siempre arriba. */
export function PageContainer({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto flex w-full flex-col gap-5 px-4 pb-12 pt-4 md:px-8 md:pt-8 ${wide ? 'max-w-7xl' : 'max-w-xl'}`}>
      <BackLink />
      {children}
    </div>
  )
}
