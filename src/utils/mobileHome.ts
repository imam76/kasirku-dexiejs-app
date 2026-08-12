const MOBILE_HOME_SERVICE_PRIORITY = [
  '/transaction',
  '/sales',
  '/master-data',
  '/purchases',
  '/finance',
  '/history',
  '/report',
  '/hr',
  '/koperasi',
  '/settings',
] as const;

const priorityByPath = new Map<string, number>(
  MOBILE_HOME_SERVICE_PRIORITY.map((path, index) => [path, index]),
);

export const getUserInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? '')
    .join('');
};

export const prioritizeMobileHomeServices = <T extends { to: string }>(items: T[]) => (
  items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((left, right) => {
      const leftPriority = priorityByPath.get(left.item.to) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = priorityByPath.get(right.item.to) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.originalIndex - right.originalIndex;
    })
    .map(({ item }) => item)
);

export const getMobileHomeServiceSelection = <T extends { to: string }>(
  items: T[],
  maximumCells = 8,
) => {
  const prioritizedItems = prioritizeMobileHomeServices(items);
  const needsMoreCell = prioritizedItems.length > maximumCells;
  const visibleItemLimit = needsMoreCell ? maximumCells - 1 : maximumCells;

  return {
    items: prioritizedItems.slice(0, Math.max(0, visibleItemLimit)),
    hasMore: needsMoreCell,
    hiddenCount: Math.max(0, prioritizedItems.length - visibleItemLimit),
  };
};
