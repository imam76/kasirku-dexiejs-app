import { createLazyFileRoute } from '@tanstack/react-router';
import SlowMovingReport from '@/view/SlowMovingReport';

export const Route = createLazyFileRoute('/report/slow-moving-report')({ component: SlowMovingReport });
