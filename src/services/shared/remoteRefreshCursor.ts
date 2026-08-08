export const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
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
