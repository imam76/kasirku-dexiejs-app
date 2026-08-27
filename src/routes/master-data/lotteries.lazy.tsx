import { createLazyFileRoute } from '@tanstack/react-router'
import LotteryManagement from '@/view/master-data/LotteryManagement'

export const Route = createLazyFileRoute('/master-data/lotteries')({
  component: Lotteries,
})

function Lotteries() {
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <LotteryManagement />
    </div>
  )
}
