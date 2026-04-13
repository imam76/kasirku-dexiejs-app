import { createLazyFileRoute } from '@tanstack/react-router'
import PurchaseReport from '@/view/PurchaseReport'

export const Route = createLazyFileRoute('/purchase-report')({
  component: PurchaseReport,
})
