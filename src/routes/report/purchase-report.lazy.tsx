import { createLazyFileRoute } from '@tanstack/react-router'
import PurchaseReport from '@/view/PurchaseReport'

export const Route = createLazyFileRoute('/report/purchase-report')({
  component: PurchaseReport,
})
