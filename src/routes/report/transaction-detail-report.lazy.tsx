import { createLazyFileRoute } from '@tanstack/react-router'
import TransactionDetailReport from '@/view/TransactionDetailReport'

export const Route = createLazyFileRoute('/report/transaction-detail-report')({
  component: TransactionDetailReport,
})
