/**
 * Admin "Test in app" preview mode.
 *
 * The admin Scenario Builder embeds the consumer app in an iframe at
 * `/?pbt_preview=1` and drives it over postMessage. A preview run is a REAL
 * AI session (that's the point — the admin is testing the prompt), but it must
 * not look like a real user to anything downstream:
 *
 *   • no `nav_events` (src/lib/analytics.ts)
 *   • no `ai_call_telemetry` / `ai_turn_telemetry` (src/services/aiTelemetry.ts)
 *   • no `training_sessions` / `rag_documents` rows, no local `pbt:sessions`
 *     history (src/features/chat/useTextChat.ts, src/services/ragDocument.ts)
 *   • no post-session feedback prompt
 *
 * Every one of those gates reads {@link isPreviewMode} — a single query-string
 * check, deliberately synchronous so it can sit as the first statement of an
 * emitter, exactly like `isTrainingUseAllowed()` next to it.
 *
 * The run store below carries the *requested mode* from the builder's message
 * into `ChatScreen` (whose default is voice) and gives each re-run a fresh
 * `runId` so an already-open chat restarts cleanly instead of continuing the
 * previous draft's session.
 */

export const PREVIEW_PARAM = 'pbt_preview';

/** True when this document was loaded inside the admin preview iframe. */
export function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
  } catch {
    return false;
  }
}

export type PreviewChatMode = 'text' | 'voice';

export interface PreviewRun {
  /** Monotonic — a new run id is the "restart this chat" signal. */
  runId: number;
  mode: PreviewChatMode;
}

let currentRun: PreviewRun | null = null;
const listeners = new Set<() => void>();

/**
 * Publish a new preview run. Returns the run so the caller can correlate it;
 * subscribers re-read via {@link getPreviewRun}.
 */
export function startPreviewRun(mode: PreviewChatMode): PreviewRun {
  currentRun = { runId: (currentRun?.runId ?? 0) + 1, mode };
  // Copy before iterating — a subscriber may unsubscribe during notify.
  for (const listener of [...listeners]) listener();
  return currentRun;
}

/**
 * Current run, or null outside preview. Reference-stable between runs so it
 * is safe as a `useSyncExternalStore` snapshot.
 */
export function getPreviewRun(): PreviewRun | null {
  return currentRun;
}

export function subscribePreviewRun(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only reset. */
export function __resetPreviewRuns(): void {
  currentRun = null;
  listeners.clear();
}
