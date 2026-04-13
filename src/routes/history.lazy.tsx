import { createLazyFileRoute } from '@tanstack/react-router'
import History from '@/view/History'

export const Route = createLazyFileRoute('/history')({
  component: History,
})
