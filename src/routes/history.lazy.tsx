import { createLazyFileRoute } from '@tanstack/react-router'
import History from '@/components/History'

export const Route = createLazyFileRoute('/history')({
  component: History,
})
