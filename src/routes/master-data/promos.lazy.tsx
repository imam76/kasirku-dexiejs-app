import { createLazyFileRoute } from '@tanstack/react-router'
import PromoManagement from '@/view/master-data/PromoManagement'

export const Route = createLazyFileRoute('/master-data/promos')({
  component: Promos,
})

function Promos() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PromoManagement />
    </div>
  )
}
