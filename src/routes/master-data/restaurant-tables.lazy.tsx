import { createLazyFileRoute } from '@tanstack/react-router';
import RestaurantTableManagement from '@/view/master-data/restaurant-tables/RestaurantTableManagement';

export const Route = createLazyFileRoute('/master-data/restaurant-tables')({
  component: RestaurantTableManagement,
});
