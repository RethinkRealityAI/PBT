/**
 * Gemini model IDs — the single source of truth for BOTH the browser and the
 * Netlify Functions. Dependency-free on purpose (imported by `src/**` and
 * `netlify/functions/**`).
 *
 * Preview aliases can be retired by Google; when one goes, this is the only
 * file to change (plus a redeploy). See Operations runbooks → "Update the AI
 * model IDs".
 */

/** Text role-play, ACT scoring, coach hints, Pet Vision, admin dry-runs. */
export const MODEL_TEXT = 'gemini-3-flash-preview';
/** Live voice WebSocket session (audio in / audio out + transcription). */
export const MODEL_LIVE = 'gemini-3.1-flash-live-preview';
/** Knowledge-base + session embeddings (server only). */
export const MODEL_EMBEDDING = 'gemini-embedding-001';
