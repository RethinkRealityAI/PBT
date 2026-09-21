/**
 * Pure AI-telemetry helpers shared by the browser (`src/services/aiTelemetry`)
 * and the Netlify Functions (`netlify/functions/_shared/ai.ts`).
 *
 * Dependency-free on purpose: no Supabase, no storage, no `window`. The
 * browser module re-exports everything here so existing importers keep
 * working; the functions import from here directly.
 */

export type CallType =
  | 'roleplay'
  | 'evaluate'
  | 'voice'
  | 'hint'
  | 'vision'
  | 'fecal_scan';

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

/**
 * Public Gemini cost table (USD per 1M tokens, approximate). Update when
 * pricing changes — fine if slightly stale, this is for trend visibility.
 *
 * `gemini-3-flash-preview` verified 2026-09 against
 * ai.google.dev/gemini-api/docs/pricing (paid tier, ≤200k context); Google
 * doubles these on 2027-01-01.
 */
export const COST_PER_M: Record<string, { in: number; out: number }> = {
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-3-flash-preview': { in: 0.75, out: 3.75 },
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
export const REFUSAL_PATTERNS: readonly RegExp[] = [
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
