import { createLazyFileRoute } from '@tanstack/react-router'
import DepositReport from '@/view/DepositReport'

export const Route = createLazyFileRoute('/report/deposit-report')({
  component: DepositReport,
})
