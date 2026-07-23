import { createLazyFileRoute } from '@tanstack/react-router';
import RestaurantPosPrototype from '@/features/restaurant-pos/RestaurantPosPrototype';

export const Route = createLazyFileRoute('/pos-resto')({
  component: RestaurantPosPrototype,
});
