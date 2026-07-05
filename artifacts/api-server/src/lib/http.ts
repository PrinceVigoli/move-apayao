/**
 * Shared request-parameter parsing helpers. Centralizing these avoids the
 * inconsistency where some routes guarded against a malformed :id/offset
 * and others silently forwarded NaN/negative values to the database.
 */

/**
 * Parse a route param (e.g. `:id`) as a positive integer.
 * Returns null for anything that isn't a valid positive integer, so callers
 * can respond 400 instead of letting `eq(column, NaN)` reach the database.
 */
export function parseIdParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Parse and clamp a startDate/endDate query pair to a maximum span, so an
 * admin (or a dashboard bug) can't trigger an unbounded full-table
 * aggregation by requesting a multi-year range.
 */
export function parseDateRange(
  query: Record<string, unknown>,
  { defaultDays = 30, maxDays = 366 }: { defaultDays?: number; maxDays?: number } = {},
): DateRange {
  const end = query.endDate
    ? new Date(String(query.endDate))
    : new Date();
  const defaultStart = new Date(end.getTime() - defaultDays * 86_400_000);
  const start = query.startDate ? new Date(String(query.startDate)) : defaultStart;

  const validEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const validStart = Number.isNaN(start.getTime()) ? defaultStart : start;

  const maxSpanMs = maxDays * 86_400_000;
  const clampedStart =
    validEnd.getTime() - validStart.getTime() > maxSpanMs
      ? new Date(validEnd.getTime() - maxSpanMs)
      : validStart;

  return {
    startDate: clampedStart.toISOString().split("T")[0]!,
    endDate: validEnd.toISOString().split("T")[0]!,
  };
}
export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export interface Pagination {
  limit: number;
  offset: number;
}

/**
 * Parse `limit`/`offset` query params defensively: clamps limit to
 * [1, maxLimit] and offset to [0, +Infinity), falling back to sane defaults
 * on anything malformed (missing, non-numeric, negative, NaN) instead of
 * passing NaN/negative values straight to the database.
 */
export function parsePagination(
  query: Record<string, unknown>,
  { defaultLimit = 20, maxLimit = 100 }: PaginationOptions = {},
): Pagination {
  const rawLimit = Number(query.limit ?? defaultLimit);
  const rawOffset = Number(query.offset ?? 0);

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : defaultLimit;

  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}
