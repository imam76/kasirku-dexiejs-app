import { createLazyFileRoute } from '@tanstack/react-router'
import StockManagement from '@/view/master-data/products/StockManagement'

export const Route = createLazyFileRoute('/master-data/products')({
  component: StockManagement,
})
