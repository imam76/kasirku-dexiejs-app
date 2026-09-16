export interface DateIdCursor {
  date: string;
  id: string;
}

export interface DateIdCursorPage<T> {
  rows: T[];
  nextCursor?: DateIdCursor;
}

export const normalizeCursorPageSize = (value: number | undefined, fallback: number) => (
  Math.max(1, Math.min(100, Math.floor(value ?? fallback)))
);
