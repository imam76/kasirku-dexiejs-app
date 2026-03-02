import { createLazyFileRoute } from '@tanstack/react-router'
import { NotFound } from '@/components/NotFound'

export const Route = createLazyFileRoute('/$')({
  component: NotFound,
})
