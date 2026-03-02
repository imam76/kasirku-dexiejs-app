import { createLazyFileRoute } from '@tanstack/react-router'
import ShoppingNote from '@/components/ShoppingNote'

export const Route = createLazyFileRoute('/shopping-note')({
  component: ShoppingNote,
})
