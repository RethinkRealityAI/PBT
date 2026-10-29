/**
 * Per-IP request limits for the trainee-facing functions — ONE place, sized
 * for a workshop room.
 *
 * Every limit is keyed by client IP, and a clinic or workshop room reaches us
 * through ONE IP (shared Wi-Fi / NAT). The first limits were sized for one
 * person: 6 voice starts and 10 scorings a minute per IP meant a room of 30
 * trainees starting voice — or reaching time's-up — together would see errors.
 * These are sized for a room of about 40 trainees practising at once:
 *
 *  - roleplay  — a text reply every ~10 s each at peak → 40 × 6 = 240/min
 *  - evaluate  — everyone finishing within the same minute (time's up)
 *  - voiceToken — everyone pressing Begin within the same minute
 *  - hint      — ≤ 3 per session, bunched
 *  - ragRetrieve — one per session open, plus scenario browsing
 *  - sessionSave / sessionCheckpoint — final saves, and a checkpoint after
 *    every exchange (updates only — the per-device daily row cap still
 *    bounds inserts)
 *
 * They remain best-effort abuse brakes (in-memory, per function instance —
 * see `rateLimit` in `ai.ts`), not quotas. Fecal Scan and Pet Vision are not
 * room activities and keep their own small limits.
 */
export const RATE_LIMITS = {
  roleplay: 240,
  evaluate: 60,
  voiceToken: 60,
  hint: 90,
  ragRetrieve: 120,
  sessionSave: 120,
  sessionCheckpoint: 480,
  sessionClaim: 10,
} as const;

/** Every limit above is per minute. */
export const RATE_WINDOW_MS = 60_000;

export function perMinute(limit: number): { limit: number; windowMs: number } {
  return { limit, windowMs: RATE_WINDOW_MS };
}
