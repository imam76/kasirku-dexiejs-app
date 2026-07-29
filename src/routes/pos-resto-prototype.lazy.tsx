import RestaurantPosPrototype from "@/features/restaurant-pos/RestaurantPosPrototype";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/pos-resto-prototype")({
  component: RestaurantPosPrototype,
});
