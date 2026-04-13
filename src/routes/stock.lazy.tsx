import { createLazyFileRoute } from '@tanstack/react-router'
import StockManagement from '@/view/stock-management/StockManagement'

export const Route = createLazyFileRoute('/stock')({
  component: StockManagement,
})
