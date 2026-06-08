import { createLazyFileRoute } from '@tanstack/react-router'
import StockCard from '@/view/StockCard'

export const Route = createLazyFileRoute('/report/stock-card')({
  component: StockCard,
})
