import { PageContainer } from '@/components/PageContainer'
import { TrackingForm } from './TrackingForm'

export const metadata = { title: 'Seguí tu pedido · Serena Mia', robots: { index: false } }

export default function TrackingPage() {
  return (
    <PageContainer>
      <div>
        <h2 className="text-2xl font-bold text-brand-ink">Seguí tu pedido</h2>
        <p className="mt-1 text-base">Escribí el número de pedido y el teléfono que usaste al comprar.</p>
      </div>
      <TrackingForm />
    </PageContainer>
  )
}
