import { createLazyFileRoute } from '@tanstack/react-router'
import ProfitManagement from '@/components/ProfitManagement'

export const Route = createLazyFileRoute('/profit')({
  component: ProfitManagement,
})
