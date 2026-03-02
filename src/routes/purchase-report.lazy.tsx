import { createLazyFileRoute } from '@tanstack/react-router'
import PurchaseReport from '@/components/PurchaseReport'

export const Route = createLazyFileRoute('/purchase-report')({
  component: PurchaseReport,
})
