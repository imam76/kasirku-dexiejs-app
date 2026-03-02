import { createLazyFileRoute } from '@tanstack/react-router'
import SalesReport from '@/components/SalesReport'

export const Route = createLazyFileRoute('/sales-report')({
  component: SalesReport,
})
