export const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export interface UpdatedAtIdCursor {
  updatedAt: string;
  id: string;
}

interface PullUpdatedAtIdPagesOptions<T> {
  initialCursor?: UpdatedAtIdCursor;
  pageSize: number;
  loadPage: (cursor?: UpdatedAtIdCursor) => Promise<T[]>;
  mergePage: (page: T[]) => Promise<void>;
  saveCursor: (cursor: UpdatedAtIdCursor) => Promise<void>;
  getUpdatedAt: (item: T) => string;
  getId: (item: T) => string;
}

export const isSameUpdatedAtIdCursor = (
  left: UpdatedAtIdCursor | undefined,
  right: UpdatedAtIdCursor | undefined,
) => (
  left?.updatedAt === right?.updatedAt && left?.id === right?.id
);

export const getLastUpdatedAtIdCursor = <T>(
  items: T[],
  getUpdatedAt: (item: T) => string,
  getId: (item: T) => string,
): UpdatedAtIdCursor | undefined => {
  const last = items[items.length - 1];
  if (!last) return undefined;
  return { updatedAt: getUpdatedAt(last), id: getId(last) };
};

/**
 * Pulls a deterministic `(updated_at, id)` keyset one page at a time. The checkpoint is saved
 * only after a page has merged successfully, so an interrupted backfill either resumes at the
 * next page or safely replays the last idempotent page.
 */
export const pullUpdatedAtIdPages = async <T>({
  initialCursor,
  pageSize,
  loadPage,
  mergePage,
  saveCursor,
  getUpdatedAt,
  getId,
}: PullUpdatedAtIdPagesOptions<T>): Promise<UpdatedAtIdCursor | undefined> => {
  let cursor = initialCursor;

  while (true) {
    const page = await loadPage(cursor);
    if (page.length === 0) break;

    await mergePage(page);

    const nextCursor = getLastUpdatedAtIdCursor(page, getUpdatedAt, getId);
    if (!nextCursor || isSameUpdatedAtIdCursor(nextCursor, cursor)) {
      throw new Error('PostgreSQL delta fetch returned a non-advancing (updated_at, id) cursor.');
    }

    await saveCursor(nextCursor);
    cursor = nextCursor;

    if (page.length < pageSize) break;
  }

  return cursor;
};

export const getLaterUpdatedAt = (current: string | undefined, candidate: string | undefined) => {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTimestamp = toTimestamp(current);
  const candidateTimestamp = toTimestamp(candidate);

  if (currentTimestamp !== null && candidateTimestamp !== null) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  return candidate > current ? candidate : current;
};

export const getLatestLocalRemoteUpdatedAt = <T>(
  records: T[],
  getRemoteUpdatedAt: (record: T) => string | undefined,
) => (
  records.reduce<string | undefined>(
    (latest, record) => getLaterUpdatedAt(latest, getRemoteUpdatedAt(record)),
    undefined,
  )
);

export const getLatestRemoteUpdatedAt = <T>(
  items: T[],
  getUpdatedAt: (item: T) => string | undefined,
) => (
  items.reduce<string | undefined>(
    (latest, item) => getLaterUpdatedAt(latest, getUpdatedAt(item)),
    undefined,
  )
);
