import { describe, expect, test } from 'bun:test';
import {
  pullUpdatedAtIdPages,
  type UpdatedAtIdCursor,
} from '@/services/shared/remoteRefreshCursor';

interface RemoteRow {
  id: string;
  updated_at: string;
}

const PAGE_SIZE = 200;
const TIED_TIMESTAMP = '2026-08-27T00:00:00.000Z';

const rowsAtSameTimestamp = (count: number): RemoteRow[] => Array.from(
  { length: count },
  (_, index) => ({
    id: `row-${String(index + 1).padStart(4, '0')}`,
    updated_at: TIED_TIMESTAMP,
  }),
);

const pageLoader = (rows: RemoteRow[]) => async (cursor?: UpdatedAtIdCursor) => rows
  .filter((row) => (
    !cursor
    || row.updated_at > cursor.updatedAt
    || (row.updated_at === cursor.updatedAt && row.id > cursor.id)
  ))
  .slice(0, PAGE_SIZE);

describe('updated_at + id sync cursor', () => {
  test('pulls every tied row across a page boundary and replays idempotently', async () => {
    const remoteRows = rowsAtSameTimestamp(PAGE_SIZE + 1);
    const localRows = new Map<string, RemoteRow>();
    let checkpoint: UpdatedAtIdCursor | undefined;

    const pull = (initialCursor = checkpoint) => pullUpdatedAtIdPages({
      initialCursor,
      pageSize: PAGE_SIZE,
      loadPage: pageLoader(remoteRows),
      mergePage: async (page) => {
        page.forEach((row) => localRows.set(row.id, row));
      },
      saveCursor: async (cursor) => {
        checkpoint = cursor;
      },
      getUpdatedAt: (row) => row.updated_at,
      getId: (row) => row.id,
    });

    await pull(undefined);
    expect(localRows.size).toBe(PAGE_SIZE + 1);
    expect(checkpoint).toEqual({
      updatedAt: TIED_TIMESTAMP,
      id: `row-${String(PAGE_SIZE + 1).padStart(4, '0')}`,
    });

    await pull();
    expect(localRows.size).toBe(PAGE_SIZE + 1);
  });

  test('checkpoints only merged pages and resumes safely after interruption', async () => {
    const remoteRows = rowsAtSameTimestamp(PAGE_SIZE * 2 + 1);
    const localRows = new Map<string, RemoteRow>();
    let checkpoint: UpdatedAtIdCursor | undefined;
    let mergeCount = 0;

    await expect(pullUpdatedAtIdPages({
      pageSize: PAGE_SIZE,
      loadPage: pageLoader(remoteRows),
      mergePage: async (page) => {
        mergeCount += 1;
        if (mergeCount === 2) throw new Error('simulated interruption');
        page.forEach((row) => localRows.set(row.id, row));
      },
      saveCursor: async (cursor) => {
        checkpoint = cursor;
      },
      getUpdatedAt: (row) => row.updated_at,
      getId: (row) => row.id,
    })).rejects.toThrow('simulated interruption');

    expect(localRows.size).toBe(PAGE_SIZE);
    expect(checkpoint?.id).toBe(`row-${String(PAGE_SIZE).padStart(4, '0')}`);

    await pullUpdatedAtIdPages({
      initialCursor: checkpoint,
      pageSize: PAGE_SIZE,
      loadPage: pageLoader(remoteRows),
      mergePage: async (page) => {
        page.forEach((row) => localRows.set(row.id, row));
      },
      saveCursor: async (cursor) => {
        checkpoint = cursor;
      },
      getUpdatedAt: (row) => row.updated_at,
      getId: (row) => row.id,
    });

    expect(localRows.size).toBe(PAGE_SIZE * 2 + 1);
    expect(checkpoint?.id).toBe(`row-${String(PAGE_SIZE * 2 + 1).padStart(4, '0')}`);
  });
});
