import { createLazyFileRoute } from '@tanstack/react-router'
import UnitManagement from '@/view/UnitManagement'

export const Route = createLazyFileRoute('/units')({
  component: UnitManagement,
})
