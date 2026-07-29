import { createLazyFileRoute } from '@tanstack/react-router';
import RestaurantPos from '@/features/restaurant-pos/RestaurantPos';

export const Route = createLazyFileRoute('/pos-resto')({
  component: RestaurantPos,
});
