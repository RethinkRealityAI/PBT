/**
 * Deterministic "today's pick" rotation for the Home scenario card.
 *
 * The base index changes once per local calendar day and differs per ECHO
 * driver, so two teammates with different profiles practice different
 * scenarios on the same day, and the same user sees a fresh pick tomorrow —
 * without any stored state. Manual prev/next paging is applied on top.
 */
export function dailyPickIndex(
  total: number,
  driverSeed: string,
  date: Date = new Date(),
): number {
  if (total <= 0) return 0;
  let h = 0;
  const key = dayDriverKey(driverSeed, date);
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % total;
}

/** Identity of a rotation slot: one local calendar day, one driver. */
export function dayDriverKey(driverSeed: string, date: Date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${driverSeed}`;
}

export interface DailyPickBase {
  /** The day+driver slot this base was computed for. */
  key: string;
  /** Index into the scenario library, before manual paging. */
  base: number;
  /** True once computed from a fully-resolved library — then it stops moving. */
  frozen: boolean;
}

/**
 * Keep the displayed daily pick still while the scenario library resolves.
 *
 * The library Home renders is `LIBRARY_SCENARIOS` filtered/extended by the
 * admin flag snapshot, which arrives *after* mount and is re-fetched every
 * five minutes. Whenever an admin hides a seed scenario or publishes their
 * own, `total` changes — and a base recomputed from the new total points at
 * a different scenario, so the hero card silently swaps out from under
 * whoever is reading it.
 *
 * So: recompute freely while the library is still provisional, then lock the
 * base for the rest of the day+driver slot once it has resolved. A new day or
 * a new ECHO driver produces a new key and unlocks it again. Manual prev/next
 * paging is applied by the caller on top of this base and is untouched.
 */
export function resolveDailyPickBase(
  previous: DailyPickBase | null,
  args: { total: number; driverSeed: string; resolved: boolean; date?: Date },
): DailyPickBase | null {
  const { total, driverSeed, resolved } = args;
  // Nothing to index into yet — hold whatever we had rather than collapsing
  // to 0 and jumping once the library lands.
  if (total <= 0) return previous;
  const date = args.date ?? new Date();
  const key = dayDriverKey(driverSeed, date);
  if (previous && previous.key === key && previous.frozen) return previous;
  return { key, base: dailyPickIndex(total, driverSeed, date), frozen: resolved };
}
