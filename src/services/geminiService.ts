/**
 * Text-mode AI client — customer role-play turns, coach hints and the
 * ACT-first scorer.
 *
 * Every call goes to a Netlify Function (`netlify/functions/ai-*`) that holds
 * the Gemini key, builds the system prompt from the knowledge modules and the
 * admin simulation config, and records telemetry. The browser never sees the
 * key, never sends the simulation config (the server loads its own — it is
 * authoritative for scoring) and never sends retrieved RAG chunks (the server
 * retrieves for the prompt; the client's own retrieval only feeds
 * `rag_documents`). See `src/shared/ai/contract.ts` for the trust boundary.
 *
 * The exported signatures are unchanged from the in-browser implementation
 * they replace, so every caller (`useTextChat`, `voiceSession`, `CoachHint`)
 * keeps working as-is.
 */
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import type { PromptOverrides } from '../data/knowledge/promptBuilders';
import type { Locale } from '../i18n/locales';
import {
  AI_ENDPOINTS,
  type EvaluateRequest,
  type EvaluateResponse,
  type HintRequest,
  type HintResponse,
  type RoleplayRequest,
  type RoleplayResponse,
} from '../shared/ai/contract';
import { postAi } from './aiApi';

export { MODEL_TEXT, MODEL_LIVE } from '../shared/ai/models';

export interface CallOptions {
  /** PBT session id (training_sessions.id). Telemetry rows attribute to it. */
  sessionId?: string | null;
  /**
   * Bounded per-scenario admin overrides (customer prompt prefix/suffix).
   * The server honours these ONLY in admin preview; otherwise it loads them
   * itself from `scenario_overrides`.
   */
  promptOverrides?: PromptOverrides;
  /**
   * App locale. Drives the language the CUSTOMER speaks and the language the
   * COACHING output is written in. Defaults to English server-side, so every
   * existing caller keeps today's behaviour untouched.
   */
  locale?: Locale;
  /** Which pipeline produced the transcript being scored. Defaults to text. */
  mode?: 'text' | 'voice';
}

/**
 * Customer voice in text mode. Returns the next AI message.
 * Throws on failure — callers decide how to surface the error.
 */
export async function generateRoleplayMessage(
  scenario: Scenario,
  history: ChatMessage[],
  userMessage?: string,
  options: CallOptions = {},
): Promise<ChatMessage> {
  const body: RoleplayRequest = {
    scenario,
    // Strip any transient error messages from history before sending to the model
    history: history.filter((m) => !m._transientError),
    userMessage,
    sessionId: options.sessionId ?? null,
    locale: options.locale,
    promptOverrides: options.promptOverrides,
  };
  const { message } = await postAi<RoleplayResponse>(AI_ENDPOINTS.roleplay, body);
  if (!message || typeof message.text !== 'string' || !message.text.trim()) {
    throw new Error('Empty response from AI');
  }
  return message;
}

/**
 * One coaching nudge for the trainee's next reply, from the live transcript.
 * Plain text, ≤2 sentences (the prompt enforces it; we also hard-trim).
 * Throws on failure — the caller shows a soft "coach unavailable" state.
 */
export async function generateCoachHint(
  scenario: Scenario,
  history: ChatMessage[],
  options: CallOptions = {},
): Promise<string> {
  const body: HintRequest = {
    scenario,
    history: history.filter((m) => !m._transientError),
    sessionId: options.sessionId ?? null,
    locale: options.locale,
  };
  const { hint } = await postAi<HintResponse>(AI_ENDPOINTS.hint, body);
  const text = typeof hint === 'string' ? hint.trim() : '';
  if (!text) throw new Error('Empty coach response');
  // Belt-and-braces length cap so a drifting model can't flood the drawer.
  return text.length > 320 ? `${text.slice(0, 317).trimEnd()}…` : text;
}

/**
 * The honest "we could not score this" report. Never a fake zero: it is
 * flagged `scoreUnavailable` (and carries the canonical critique
 * `isScoreUnavailable()` also recognises) so StatsScreen offers a retry and
 * History excludes it from averages. Fresh object per call — consumers
 * mutate/persist reports.
 */
function scoreUnavailableReport(): ScoreReport {
  return {
    acknowledge: 0,
    clarify: 0,
    transform: 0,
    empathy: 0,
    rapport: 0,
    overall: 0,
    band: 'poor',
    critique:
      'We could not score this session right now. Please try again, or check your network.',
    betterAlternative: '—',
    perDimensionNotes: {
      acknowledge: '',
      clarify: '',
      transform: '',
      empathy: '',
      rapport: '',
    },
    keyMoments: [],
    turnSentiment: [],
    scoreUnavailable: true,
  };
}

/**
 * Score the staff side of a conversation. Returns the full scorecard.
 *
 * NEVER throws: the server already retries upstream and returns a
 * `scoreUnavailable` report on model failure; any transport failure here
 * (offline, timeout, 5xx) collapses to the same placeholder so the session
 * is saved and re-scorable rather than lost.
 */
export async function evaluateConversation(
  scenario: Scenario,
  transcript: ChatMessage[],
  options: CallOptions = {},
): Promise<ScoreReport> {
  const body: EvaluateRequest = {
    scenario,
    transcript,
    mode: options.mode ?? 'text',
    sessionId: options.sessionId ?? null,
    locale: options.locale,
  };
  try {
    const { report } = await postAi<EvaluateResponse>(AI_ENDPOINTS.evaluate, body);
    if (!report || typeof report !== 'object') throw new Error('Empty score response');
    return report;
  } catch (error) {
    console.error('[geminiService] evaluateConversation failed', error);
    return scoreUnavailableReport();
  }
}
