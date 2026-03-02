import { createLazyFileRoute } from '@tanstack/react-router'
import StockManagement from '@/components/StockManagement'

export const Route = createLazyFileRoute('/stock')({
  component: StockManagement,
})
