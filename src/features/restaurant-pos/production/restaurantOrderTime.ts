export const formatRestaurantOrderStartTime = (openedAt?: string) => {
  if (!openedAt) return undefined;
  const date = new Date(openedAt);
  if (Number.isNaN(date.getTime())) return undefined;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};
