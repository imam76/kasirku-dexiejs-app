export const toCanonicalIsoTimestamp = (value: string): string => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Timestamp tidak valid: ${value}`);
  }

  return new Date(timestamp).toISOString();
};

export const toCanonicalOptionalIsoTimestamp = (
  value: string | null | undefined,
): string | undefined => (
  value ? toCanonicalIsoTimestamp(value) : undefined
);

export const normalizeStoredTimestamp = (
  value: string | undefined,
): string | undefined => {
  if (!value) return value;

  try {
    return toCanonicalIsoTimestamp(value);
  } catch {
    return value;
  }
};
