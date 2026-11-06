/**
 * Anonymous device ids (`pbt:session_id`) as the admin portal may see them —
 * never the stored id itself.
 *
 *   • `deviceTag` — "4F2A", a 4-character hash shown on screen and in CSVs
 *     ("Device 4F2A"). Short on purpose: it tells one device's rows apart in
 *     a list, nothing more (it can collide across hundreds of devices).
 *   • `deviceKey` — a 16-character hash used only to JOIN rows of the same
 *     device (an anonymous session with that device's latest ECHO quiz). It
 *     is derived, so the raw id never has to leave the server for it.
 *
 * Pure (FNV-1a), shared by the server and the admin app.
 */

function fnv1a(id: string, basis: number): number {
  let h = basis;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function clean(anonId: string | null | undefined): string {
  return typeof anonId === 'string' ? anonId.trim() : '';
}

/** "4F2A" — a short, stable tag for a device id. Null without an id. */
export function deviceTag(anonId: string | null | undefined): string | null {
  const id = clean(anonId);
  if (!id) return null;
  return (fnv1a(id, 0x811c9dc5) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/** A 16-hex join key for a device id (two independent 32-bit hashes). Null without an id. */
export function deviceKey(anonId: string | null | undefined): string | null {
  const id = clean(anonId);
  if (!id) return null;
  const a = fnv1a(id, 0x811c9dc5).toString(16).padStart(8, '0');
  const b = fnv1a(`pbt:${id}`, 0x050c5d1f).toString(16).padStart(8, '0');
  return `${a}${b}`;
}
