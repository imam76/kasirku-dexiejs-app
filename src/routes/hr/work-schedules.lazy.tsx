import { createLazyFileRoute } from '@tanstack/react-router';
import HrWorkScheduleManagement from '@/view/hr/HrWorkScheduleManagement';

export const Route = createLazyFileRoute('/hr/work-schedules')({
  component: HrWorkScheduleManagement,
});
