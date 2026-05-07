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

export type CallType = 'roleplay' | 'evaluate' | 'voice' | 'hint';

export interface AiCallRecord {
  sessionId?: string | null;
  callType: CallType;
  modelId: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  refusal?: boolean;
  offTopic?: boolean;
  endTokenEmitted?: boolean;
  retries?: number;
  error?: string | null;
}

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

/**
 * Public Gemini cost table (USD per 1M tokens, approximate). Update when
 * pricing changes — fine if slightly stale, this is for trend visibility.
 */
const COST_PER_M: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-3-flash-preview': { in: 0.3, out: 2.5 },
  'gemini-3.1-flash-live-preview': { in: 0.3, out: 2.5 },
  'gemini-2.0-flash-live-001': { in: 0.3, out: 2.5 },
  default: { in: 0.5, out: 4.0 },
};

export function estimateCostUsd(
  modelId: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const t = COST_PER_M[modelId] ?? COST_PER_M.default;
  return (tokensIn / 1e6) * t.in + (tokensOut / 1e6) * t.out;
}

/**
 * Heuristic: did the model refuse the roleplay? Triggers a flag without
 * blocking the user — admins surface these via AI Quality screen.
 */
const REFUSAL_PATTERNS = [
  /i (?:can(?:not|'?t)|am unable to|won'?t)/i,
  /as an ai/i,
  /i don'?t feel comfortable/i,
  /against my guidelines/i,
];
export function isLikelyRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

/**
 * Crude token estimate when the SDK doesn't return usage. ~4 chars/token
 * for English. Good enough for cost trends — the dashboard surfaces an
 * "estimated" badge when tokens come from this fallback.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function recordCall(rec: AiCallRecord): Promise<void> {
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
