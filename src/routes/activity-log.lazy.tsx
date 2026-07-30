import { createLazyFileRoute } from '@tanstack/react-router'
import { ActivityLogViewer } from '@/view/auth/ActivityLogViewer'

export const Route = createLazyFileRoute('/activity-log')({
  component: ActivityLog,
})

function ActivityLog() {
  return (
    <div className="mx-auto max-w-[1600px] p-4 md:p-8">
      <ActivityLogViewer />
    </div>
  )
}
