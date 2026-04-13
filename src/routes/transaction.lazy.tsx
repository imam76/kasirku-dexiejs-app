import { createLazyFileRoute } from '@tanstack/react-router'
import Transaction from '@/view/Transaction'

export const Route = createLazyFileRoute('/transaction')({
  component: Transaction,
})
