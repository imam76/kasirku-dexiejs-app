export const getMobileCrudRemainingCount = (total: number, visibleCount: number) => (
  Math.max(0, total - Math.max(0, visibleCount))
);

export const getNextMobileCrudVisibleCount = (
  total: number,
  visibleCount: number,
  step: number,
) => Math.min(
  Math.max(0, total),
  Math.max(0, visibleCount) + Math.max(1, step),
);
