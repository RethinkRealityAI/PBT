/**
 * Wall-clock limits on a live voice session, measured from socket open.
 *
 * Shared (dependency-free) because two sides must agree on them: the browser
 * hook that enforces them (`src/services/voiceSession.ts`) and the function
 * that mints the session's ephemeral token (`netlify/functions/ai-voice-token`)
 * — the token's lifetime must outlast the LONGEST session these limits allow,
 * or the socket dies mid-conversation and the trainee loses an unscored
 * session. `netlify/functions/__tests__/voiceToken.test.ts` pins that.
 *
 * Why a cap at all: Live audio bills per second on both legs, and nothing in
 * the conversation loop ends a session the user walked away from (phone in a
 * pocket, forgotten desktop tab).
 *
 * What happens at the cap (2026-10-29, after workshop feedback that trainees
 * who "ran out of time" were cut off and left unscored): the session is NOT
 * ended for them. The mic pauses, the customer finishes their line, and the
 * trainee chooses — score it now, keep going (a bounded number of
 * extensions), or start over. An unanswered prompt scores the session after
 * `decisionMs`, so an abandoned tab still stops billing and still keeps the
 * work.
 */
export const VOICE_SESSION_CAPS = {
  /** 5:00 — the first "time's up" prompt. */
  hardCapMs: 5 * 60_000,
  /** The countdown + "about a minute left" notice starts this long before each deadline. */
  warnLeadMs: 60_000,
  /** 4:00 — first warning (kept as a named value for callers and tests). */
  warnMs: 4 * 60_000,
  /** Each "Keep going" adds this much time. */
  extensionMs: 3 * 60_000,
  /** How many times a trainee may keep going. */
  maxExtensions: 2,
  /** At the deadline, a trainee mid-sentence gets up to this long to finish. */
  finishSentenceMs: 10_000,
  /** An unanswered time's-up prompt scores the session after this long. */
  decisionMs: 40_000,
  /**
   * Longest wait for the customer's in-flight line to finish playing before
   * the prompt appears (mirrors the natural-end playback ceiling).
   */
  maxDrainMs: 16_000,
} as const;

/**
 * The longest a session can stay open under these limits: every allowed
 * extension taken, each prompt left until its auto-score, each sentence grace
 * and drain at its ceiling. The token TTL must exceed this.
 */
export function voiceSessionMaxMs(caps: typeof VOICE_SESSION_CAPS = VOICE_SESSION_CAPS): number {
  const prompts = caps.maxExtensions + 1;
  return (
    caps.hardCapMs +
    caps.maxExtensions * caps.extensionMs +
    prompts * (caps.finishSentenceMs + caps.decisionMs + caps.maxDrainMs)
  );
}
