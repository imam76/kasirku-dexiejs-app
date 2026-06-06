import { createLazyFileRoute } from '@tanstack/react-router';
import CooperativeMemberManagement from '@/view/koperasi/members/CooperativeMemberManagement';

export const Route = createLazyFileRoute('/koperasi/anggota')({
  component: CooperativeMemberManagement,
});
