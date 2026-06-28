import { createLazyFileRoute } from '@tanstack/react-router';
import PayrollReport from '@/view/PayrollReport';

export const Route = createLazyFileRoute('/report/payroll-report')({
  component: PayrollReport,
});
