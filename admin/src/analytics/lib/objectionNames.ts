/**
 * Objection names for every Analytics tab — a team objection (`team:<slug>`)
 * by its real title, a built-in by its label.
 *
 * Module state on purpose: the pure list / CSV helpers (`sessionsExplorer`,
 * the profile's tables) label objections deep inside plain functions, and
 * threading a title list through each signature would touch all of them for a
 * lookup that only ever ADDS names. `useObjectionTitles`
 * (`../objectionTitles.ts`) feeds it; before it has, a team objection reads
 * as its slug in words — never a raw id. Dependency-free so the libs stay pure.
 */
import { pushbackLabel } from '../../lib/labels';

let known: ReadonlyArray<{ id: string; title: string }> = [];

/** Add titles (merged by id — two tabs never erase each other's). */
export function rememberObjectionTitles(titles: ReadonlyArray<{ id: string; title: string }>): void {
  if (titles.length === 0) return;
  const byId = new Map(known.map((k) => [k.id, k]));
  for (const t of titles) byId.set(t.id, t);
  known = [...byId.values()];
}

/** Test seam. */
export function resetObjectionTitles(): void {
  known = [];
}

/** An objection as a person reads it. */
export function objectionLabel(id: string | null | undefined, fallback = 'Unknown'): string {
  return pushbackLabel(id, known, fallback);
}
