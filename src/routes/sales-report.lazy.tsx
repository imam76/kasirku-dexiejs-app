import { createLazyFileRoute } from '@tanstack/react-router'
import SalesReport from '@/view/SalesReport'

export const Route = createLazyFileRoute('/sales-report')({
  component: SalesReport,
})
