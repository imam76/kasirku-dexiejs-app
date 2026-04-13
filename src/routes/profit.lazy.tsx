import { createLazyFileRoute } from '@tanstack/react-router'
import ProfitManagement from '@/view/ProfitManagement'

export const Route = createLazyFileRoute('/profit')({
  component: ProfitManagement,
})
