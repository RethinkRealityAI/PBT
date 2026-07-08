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
  const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${driverSeed}`;
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) {
    h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  }
  return h % total;
}
