// Pure business rules for equipment: no database, no HTTP, easy to unit test.

export const STATUSES = ["OPERATIONAL", "DEGRADED", "DOWN", "IN_MAINTENANCE"] as const;
export type EquipmentStatus = (typeof STATUSES)[number];

/** Equipment not checked for more than this many days is "stale". */
export const STALE_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Anything last checked before this moment is stale. The SQL `stale` filter and
 * `isStale()` both use it, so the list filter and the row flag always agree.
 */
export function staleCutoff(now: Date): Date {
  return new Date(now.getTime() - STALE_AFTER_DAYS * DAY_MS);
}

/** "Over 7 days": exactly 7 days old is not stale yet. */
export function isStale(lastCheckedAt: Date, now: Date): boolean {
  return lastCheckedAt.getTime() < staleCutoff(now).getTime();
}
