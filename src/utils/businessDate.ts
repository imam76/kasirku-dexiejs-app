import dayjs from '@/lib/dayjs';
import type { Dayjs } from 'dayjs';

/**
 * Business-day helpers pinned to Asia/Jakarta (WIB, UTC+7), independent of the
 * host OS timezone. Use these instead of `toISOString().slice(0, 10)` or
 * `setHours(0, 0, 0, 0)` whenever a "date" is derived from a timestamp/instant
 * for business logic (document number prefixes, daily sequence resets, report
 * date grouping/filtering).
 */

export const BUSINESS_TIMEZONE = 'Asia/Jakarta';

/**
 * Parses `value` in the Asia/Jakarta timezone, OS-timezone-independently.
 *
 * - `Date` objects and full timestamp strings (with a time component, e.g.
 *   `Z`/offset-suffixed ISO instants) are absolute instants: they are parsed
 *   as-is and then converted to Jakarta wall-clock time.
 * - Bare `YYYY-MM-DD` strings have no instant to convert — dayjs's default
 *   string parser would resolve them using the *host OS* timezone before any
 *   `.tz()` call runs, which is exactly the bug this module exists to avoid.
 *   These are parsed directly via `dayjs.tz(value, zone)`, which reads the
 *   literal digits as a Jakarta calendar date instead.
 */
export const toBusinessZonedDateTime = (value: string | Date) => (
  typeof value === 'string' && value.length <= 10
    ? dayjs.tz(value, BUSINESS_TIMEZONE)
    : dayjs(value).tz(BUSINESS_TIMEZONE)
);

/**
 * Interprets wall-clock digits selected by a date/time picker as Asia/Jakarta time,
 * regardless of the host OS timezone, and returns the corresponding UTC instant.
 */
export const businessWallTimeToIso = (value: Dayjs): string => {
  if (!value.isValid()) {
    throw new Error('Tanggal dan waktu bisnis tidak valid.');
  }

  return value.tz(BUSINESS_TIMEZONE, true).toISOString();
};

/**
 * Converts a timestamp/instant to its Asia/Jakarta calendar date key
 * (`YYYY-MM-DD`). A value between 00:00-06:59:59 WIB still resolves to the
 * correct WIB day even though its UTC date is the previous day.
 */
export const toBusinessDateKey = (value: string | Date): string => (
  toBusinessZonedDateTime(value).format('YYYY-MM-DD')
);

/**
 * Converts a timestamp/instant to its Asia/Jakarta calendar date prefix
 * (`YYYYMMDD`), for use in daily-reset document/number sequences.
 */
export const toBusinessDatePrefix = (value: string | Date): string => (
  toBusinessZonedDateTime(value).format('YYYYMMDD')
);

/**
 * Start/end of the Asia/Jakarta business day containing `value`, expressed as
 * UTC ISO instants suitable for comparing against stored `created_at`-style
 * timestamps.
 */
export const getBusinessDayBoundsIso = (value: string | Date): { startIso: string; endIso: string } => {
  const zoned = toBusinessZonedDateTime(value);
  return {
    startIso: zoned.startOf('day').toISOString(),
    endIso: zoned.endOf('day').toISOString(),
  };
};

/**
 * Whether the business-day key derived from `value` (a timestamp/instant)
 * falls within the inclusive `[from, to]` range of `YYYY-MM-DD` date keys.
 * `from`/`to` are treated as calendar dates, not instants.
 */
export const isBusinessDateKeyInRange = (
  value: string | Date | undefined,
  from?: string,
  to?: string,
): boolean => {
  if (!value) return false;
  const dateKey = toBusinessDateKey(value);
  return (!from || dateKey >= from) && (!to || dateKey <= to);
};
