/**
 * Calendar-day normalisation.
 *
 * Schedules are keyed by `{ doctor, date }` with a unique index, and
 * appointments are matched against that same date. Every site that writes or
 * looks up one of those dates must agree on what "a day" means, or the index
 * silently rejects or misses records.
 *
 * Previously the codebase mixed two conventions:
 *   - writes used `setHours(0, 0, 0, 0)`      → local midnight
 *   - lookups used `new Date(d + "T00:00:00.000Z")` → UTC midnight
 *
 * Those agree only when the process runs in UTC. Anywhere else they diverge by
 * the offset, so generating a date range silently dropped days and lookups
 * missed schedules that existed.
 *
 * UTC is the correct convention here: Mongo stores dates as UTC, the unique
 * index compares the stored value, and a clinic's "14 August" should mean the
 * same calendar day regardless of where the server happens to run.
 */

/**
 * Start of the calendar day, in UTC.
 *
 * Accepts either a `YYYY-MM-DD` string or a `Date`. For a `Date`, the UTC
 * calendar day is used — not the server's local one — so the result does not
 * change with the host timezone.
 */
export function toUtcDayStart(value: string | Date): Date {
  if (typeof value === "string") {
    // Date-only strings are already unambiguous; anything longer may carry a
    // time or offset, so round-trip it through Date to normalise first.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? value
      : new Date(value).toISOString().slice(0, 10);
    return new Date(`${dateOnly}T00:00:00.000Z`);
  }

  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

/** Today's calendar day in UTC — the comparison point for "is this in the past". */
export function utcToday(): Date {
  return toUtcDayStart(new Date());
}

/** `YYYY-MM-DD` for a date, in UTC. Useful as a map key or for comparison. */
export function toUtcDateKey(value: string | Date): string {
  return toUtcDayStart(value).toISOString().slice(0, 10);
}
