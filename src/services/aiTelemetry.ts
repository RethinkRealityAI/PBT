/**
 * AI telemetry capture.
 *
 * Wraps Gemini calls with timing + token / cost / refusal heuristics and
 * persists rows to Supabase `ai_call_telemetry`. Per-turn signals
 * (sentiment, flags, hint adherence) go to `ai_turn_telemetry`.
 *
 * All capture is best-effort: a failure to write telemetry must never
 * surface to the user, so every persist call is wrapped in try/catch and
 * logged to the console only.
 */
import { getSupabase } from '../features/auth/supabaseClient';
import { isTrainingUseAllowed } from '../lib/privacy';
import { isPreviewMode } from '../lib/previewMode';
import type { AiCallRecord } from '../shared/ai/telemetryHeuristics';

// The pure heuristics (cost table, token estimate, refusal detector) live in
// the dependency-free shared module so the Netlify AI functions can use the
// same numbers. Re-exported here so every existing importer keeps working.
export {
  COST_PER_M,
  REFUSAL_PATTERNS,
  estimateCostUsd,
  estimateTokens,
  isLikelyRefusal,
} from '../shared/ai/telemetryHeuristics';
export type { AiCallRecord, CallType } from '../shared/ai/telemetryHeuristics';

export interface AiTurnRecord {
  sessionId: string;
  turnIdx: number;
  role: 'user' | 'ai' | 'customer';
  textLen: number;
  sentiment?: number | null;
  flag?:
    | 'ai_refusal'
    | 'off_topic'
    | 'user_correction'
    | 'sentiment_spike'
    | 'script_break'
    | null;
  hintShown?: boolean;
  hintFollowed?: boolean | null;
}

export async function recordCall(rec: AiCallRecord): Promise<void> {
  // Privacy gate (spec §8.3). AI telemetry exists to improve the model +
  // product, so it is "training use" and stops on opt-out. Deliberately NOT
  // applied to the user's own saved sessions, session_feedback, or
  // platform_reports — that is their own data, not training use.
  if (!isTrainingUseAllowed()) return;
  // Admin preview: the call really happens (that's the point of testing), but
  // it must not land in the latency / cost / failure-rate trends the AI
  // Quality screen reports on.
  if (isPreviewMode()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
    await sb.from('ai_call_telemetry').insert({
      session_id: rec.sessionId ?? null,
      user_id: user?.id ?? null,
      call_type: rec.callType,
      model_id: rec.modelId,
      latency_ms: rec.latencyMs,
      tokens_in: rec.tokensIn ?? 0,
      tokens_out: rec.tokensOut ?? 0,
      cost_usd: rec.costUsd ?? 0,
      refusal: rec.refusal ?? false,
      off_topic: rec.offTopic ?? false,
      end_token_emitted: rec.endTokenEmitted ?? false,
      retries: rec.retries ?? 0,
      error: rec.error ?? null,
    });
  } catch (err) {
    console.warn('[ai-telemetry] recordCall failed', err);
  }
}

export async function recordTurns(turns: AiTurnRecord[]): Promise<void> {
  // Privacy gate (spec §8.3) — same rationale as recordCall above.
  if (!isTrainingUseAllowed()) return;
  if (isPreviewMode()) return;
  if (turns.length === 0) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));
    const rows = turns.map((t) => ({
      session_id: t.sessionId,
      user_id: user?.id ?? null,
      turn_idx: t.turnIdx,
      role: t.role,
      text_len: t.textLen,
      sentiment: t.sentiment ?? null,
      flag: t.flag ?? null,
      hint_shown: t.hintShown ?? false,
      hint_followed: t.hintFollowed ?? null,
    }));
    await sb.from('ai_turn_telemetry').insert(rows);
  } catch (err) {
    console.warn('[ai-telemetry] recordTurns failed', err);
  }
}

/**
 * Wrap an async Gemini call with timing + telemetry.
 * Returns the original result; never throws on telemetry failure.
 */
export async function withTelemetry<T>(
  meta: Omit<AiCallRecord, 'latencyMs' | 'error'> & { sessionId?: string | null },
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    const latency = Math.round(performance.now() - t0);
    void recordCall({ ...meta, latencyMs: latency });
    return result;
  } catch (err) {
    const latency = Math.round(performance.now() - t0);
    const message = err instanceof Error ? err.message : String(err);
    void recordCall({ ...meta, latencyMs: latency, error: message });
    throw err;
  }
}
