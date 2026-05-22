import { createLazyFileRoute } from '@tanstack/react-router'
import UnitManagement from '@/view/master-data/UnitManagement'

export const Route = createLazyFileRoute('/master-data/units')({
  component: UnitManagement,
})
