import { createLazyFileRoute } from '@tanstack/react-router';
import ProjectManagement from '@/view/master-data/projects/ProjectManagement';

export const Route = createLazyFileRoute('/master-data/projects')({
  component: ProjectManagement,
});
