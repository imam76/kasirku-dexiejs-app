import { createLazyFileRoute } from '@tanstack/react-router'
import ShoppingNote from '@/view/ShoppingNote'

export const Route = createLazyFileRoute('/shopping-note')({
  component: ShoppingNote,
})
