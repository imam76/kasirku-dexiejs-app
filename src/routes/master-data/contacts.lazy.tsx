import { createLazyFileRoute } from '@tanstack/react-router';
import ContactManagement from '@/view/master-data/contacts/ContactManagement';

export const Route = createLazyFileRoute('/master-data/contacts')({
  component: ContactManagement,
});
