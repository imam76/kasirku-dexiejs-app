import { createLazyFileRoute } from '@tanstack/react-router'
import PosSalesReport from '@/view/PosSalesReport'

export const Route = createLazyFileRoute('/report/pos-sales-report')({
  component: PosSalesReport,
})
