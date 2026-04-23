import { createLazyFileRoute } from '@tanstack/react-router'
import StockManagement from '@/view/stock-manager/StockManagement'

export const Route = createLazyFileRoute('/stock')({
  component: StockManagement,
})
