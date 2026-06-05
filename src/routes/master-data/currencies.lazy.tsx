import { createLazyFileRoute } from '@tanstack/react-router';
import CurrencyManagement from '@/view/master-data/currencies/CurrencyManagement';

export const Route = createLazyFileRoute('/master-data/currencies')({
  component: CurrencyManagement,
});
