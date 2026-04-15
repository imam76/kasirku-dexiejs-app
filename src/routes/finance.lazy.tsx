import { createLazyFileRoute } from '@tanstack/react-router'
import FinanceManagement from '@/view/FinanceManagement'

export const Route = createLazyFileRoute('/finance')({
  component: FinanceManagement,
})
