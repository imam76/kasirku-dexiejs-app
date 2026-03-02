import { createLazyFileRoute } from '@tanstack/react-router'
import Transaction from '@/components/Transaction'

export const Route = createLazyFileRoute('/transaction')({
  component: Transaction,
})
