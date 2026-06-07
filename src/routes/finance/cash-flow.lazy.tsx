import { createLazyFileRoute } from '@tanstack/react-router'
import FinanceManagement from '@/view/finance/FinanceManagement'

export const Route = createLazyFileRoute('/finance/cash-flow')({
  component: FinanceManagement,
})
