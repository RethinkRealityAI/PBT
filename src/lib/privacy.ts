/**
 * Privacy consent for secondary data use (spec §8.3).
 *
 * ONE toggle, stored locally at `pbt:allow_training_use`, default ON.
 *
 * What it gates — data collected *about* the user to improve the product:
 *   - `nav_events`      (src/lib/analytics.ts → logEvent)
 *   - `ai_call_telemetry` / `ai_turn_telemetry` (src/services/aiTelemetry.ts)
 *   - `rag_documents` / `rag_chunks` (src/services/ragDocument.ts)
 *
 * What it must NEVER gate — the user's own data and history, which is the
 * product working as promised rather than "training use":
 *   - their saved sessions (localStorage + `training_sessions` cloud sync)
 *   - `session_feedback` (they deliberately rated a session)
 *   - `platform_reports` (they deliberately filed a bug/suggestion)
 *
 * Reads are cheap (a single localStorage hit) and deliberately synchronous so
 * the gate can sit as the very first statement of each emitter.
 */
import { readStorage, writeStorage, STORAGE_KEYS } from './storage';

/**
 * True when the user allows their anonymised activity to be used for product
 * and AI improvement. Safe to call where `localStorage` is unavailable (SSR,
 * tests) — `readStorage` returns the `true` fallback.
 */
export function isTrainingUseAllowed(): boolean {
  return readStorage(STORAGE_KEYS.allowTrainingUse);
}

/** Persist the user's choice. */
export function setTrainingUseAllowed(allowed: boolean): void {
  writeStorage(STORAGE_KEYS.allowTrainingUse, allowed);
}
