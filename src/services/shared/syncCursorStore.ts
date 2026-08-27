import { db } from '@/lib/db';
import {
  pullUpdatedAtIdPages,
  type UpdatedAtIdCursor,
} from '@/services/shared/remoteRefreshCursor';

export const getStoredUpdatedAtIdCursor = async (
  entity: string,
): Promise<UpdatedAtIdCursor | undefined> => {
  const stored = await db.syncCursors.get(entity);
  if (!stored?.cursor_value || !stored.cursor_id) return undefined;
  return { updatedAt: stored.cursor_value, id: stored.cursor_id };
};

export const setStoredUpdatedAtIdCursor = async (
  entity: string,
  cursor: UpdatedAtIdCursor,
) => {
  await db.syncCursors.put({
    entity,
    cursor_value: cursor.updatedAt,
    cursor_id: cursor.id,
  });
};

interface PullStoredUpdatedAtIdPagesOptions<T> {
  entity: string;
  pageSize: number;
  loadPage: (cursor?: UpdatedAtIdCursor) => Promise<T[]>;
  mergePage: (page: T[]) => Promise<void>;
  getUpdatedAt: (item: T) => string;
  getId: (item: T) => string;
}

export const pullStoredUpdatedAtIdPages = async <T>({
  entity,
  ...options
}: PullStoredUpdatedAtIdPagesOptions<T>) => pullUpdatedAtIdPages({
  ...options,
  initialCursor: await getStoredUpdatedAtIdCursor(entity),
  saveCursor: (cursor) => setStoredUpdatedAtIdCursor(entity, cursor),
});
