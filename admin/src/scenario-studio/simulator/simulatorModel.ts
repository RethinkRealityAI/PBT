/**
 * Test drive — the pure model behind the in-admin simulator.
 *
 * Everything here is React-free and fetch-free so it can be unit-tested
 * (./__tests__/simulatorModel.test.ts):
 *   • the end-of-simulation token, detected and stripped exactly like the
 *     trainee app does it (src/features/chat/useTextChat.ts),
 *   • the customer's mood (red / yellow / green) in plain words,
 *   • "what changed since this conversation started" — the stale check,
 *   • the 16-turn safety cap,
 *   • the conversation state machine (a reducer), and
 *   • the plain-language verdict an admin reads once the scorer answers.
 */
import type { Scenario } from '../../../../src/data/scenarios';
import {
  isScoreUnavailable,
  normalizeScoreReport,
  type AiEmotion,
  type ChatMessage,
  type ScoreReport,
} from '../../../../src/services/types';
import type { ScenarioDraftLike } from '../../../../src/shared/scenarios/draftToScenario';
import type { SimulatorNotes } from '../api';
import { COLOR } from '../../lib/tokens';
import type { ScenarioOverrideRow } from '../../data/types';
import { FIELD_LABELS, type StudioDraft, type StudioStepKey } from '../studioModel';

// ─────────────────────────────────────────────────────────────
// End token
// ─────────────────────────────────────────────────────────────

/**
 * The token the AI customer appends when the conversation is over. Same
 * pattern as the trainee app's `END_TOKEN_RX`: any bracketed, case- and
 * spacing-tolerant variant (`[END_SIMULATION]`, `[end simulation]`,
 * `[End-Simulation]`), but the brackets are required so an owner saying
 * "can we end this simulation?" mid-conversation is not a close.
 */
export const END_TOKEN_RX = /\[\s*end[\s_-]*simulation\s*\]/i;

export function hasEndToken(text: string): boolean {
  return END_TOKEN_RX.test(text);
}

/**
 * Remove every end token and tidy the gaps it leaves — the model often puts
 * it mid-sentence ("Thanks [END_SIMULATION], bye"), which would otherwise
 * leave " ," and double spaces on screen. Mirrors useTextChat.
 */
export function stripEndToken(text: string): string {
  return text
    .replace(new RegExp(END_TOKEN_RX, 'gi'), ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────────
// Turn caps
// ─────────────────────────────────────────────────────────────

/**
 * Hard cap on customer turns — the trainee app's `MAX_CUSTOMER_TURNS`. A
 * model that never emits the end token would otherwise loop "thanks" →
 * "you're welcome" forever.
 */
export const MAX_CUSTOMER_TURNS = 16;

/** Longest reply the composer accepts (well under the server's per-turn cap). */
export const MAX_REPLY_CHARS = 2000;

export function customerTurnCount(messages: readonly ChatMessage[]): number {
  return messages.filter((m) => m.role === 'ai' && !m._transientError).length;
}

export function traineeTurnCount(messages: readonly ChatMessage[]): number {
  return messages.filter((m) => m.role === 'user').length;
}

export type EndReason = 'token' | 'cap' | 'manual';

/**
 * Whether a conversation is over after a customer turn. The token wins over
 * the cap so the divider says the owner ended it when they did.
 */
export function endReasonAfterCustomerTurn(
  customerTurns: number,
  tokenSeen: boolean,
): EndReason | null {
  if (tokenSeen) return 'token';
  if (customerTurns >= MAX_CUSTOMER_TURNS) return 'cap';
  return null;
}

export const END_DIVIDER_COPY: Record<EndReason, string> = {
  token: 'The owner ended the conversation',
  cap: `Conversation reached the ${MAX_CUSTOMER_TURNS}-turn limit`,
  manual: 'You ended the conversation',
};

// ─────────────────────────────────────────────────────────────
// Mood
// ─────────────────────────────────────────────────────────────

export interface EmotionMeta {
  label: 'Defensive' | 'Receptive' | 'Convinced';
  /** One line for a tooltip / screen reader. */
  description: string;
  tone: 'danger' | 'warn' | 'success';
  color: string;
  soft: string;
  /** Position on the meter, 1 (red) → 3 (green). */
  level: 1 | 2 | 3;
}

/** Same vocabulary as the trainee app's chat bubbles and the voice session. */
export const EMOTION_META: Record<AiEmotion, EmotionMeta> = {
  red: {
    label: 'Defensive',
    description: 'Still pushing back.',
    tone: 'danger',
    color: COLOR.danger,
    soft: COLOR.dangerSoft,
    level: 1,
  },
  yellow: {
    label: 'Receptive',
    description: 'Listening — starting to soften.',
    tone: 'warn',
    color: COLOR.warn,
    soft: COLOR.warnSoft,
    level: 2,
  },
  green: {
    label: 'Convinced',
    description: 'On board with a next step.',
    tone: 'success',
    color: COLOR.success,
    soft: COLOR.successSoft,
    level: 3,
  },
};

export const EMOTION_ORDER: readonly AiEmotion[] = ['red', 'yellow', 'green'];

export function isAiEmotion(v: unknown): v is AiEmotion {
  return v === 'red' || v === 'yellow' || v === 'green';
}

export function emotionMeta(e: unknown): EmotionMeta | null {
  return isAiEmotion(e) ? EMOTION_META[e] : null;
}

/** The mood the owner showed most recently, or null before any read. */
export function latestEmotion(messages: readonly ChatMessage[]): AiEmotion | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'ai' && !m._transientError && isAiEmotion(m.emotion)) return m.emotion;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// "What changed since this conversation started"
// ─────────────────────────────────────────────────────────────

/**
 * Every draft column the AI customer (or the scorer) reads. Card and
 * publishing columns are deliberately absent: retitling the card does not
 * make a conversation stale.
 */
export const AI_RELEVANT_FIELDS = [
  'species',
  'breed',
  'life_stage',
  'weight_kg',
  'pushback_id',
  'pushback_notes',
  'context_override',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'opening_line_override',
  'focus_area',
  'knowledge_slugs',
  'prompt_prefix',
  'prompt_suffix',
] as const satisfies ReadonlyArray<keyof ScenarioOverrideRow>;

export type AiRelevantField = (typeof AI_RELEVANT_FIELDS)[number];

// Compile-time guard: every field `draftToScenario` reads (bar the id) must be
// in the list above, or a change to it would never mark a test stale.
type _DraftToScenarioFields = Exclude<keyof ScenarioDraftLike, 'scenario_id'>;
const _everyScenarioFieldTracked: _DraftToScenarioFields extends AiRelevantField ? true : never = true;
void _everyScenarioFieldTracked;

type SnapshotValue = string | number | string[] | null;
export type AiFieldSnapshot = Record<AiRelevantField, SnapshotValue>;

/**
 * Comparable form of one draft value: blank strings, NaN and empty lists all
 * mean "unset" (null), and document lists compare as sets.
 */
function normaliseValue(v: unknown): SnapshotValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    const items = v
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim())
      .sort();
    return items.length ? items : null;
  }
  return null;
}

export function snapshotAiFields(draft: StudioDraft): AiFieldSnapshot {
  const out = {} as AiFieldSnapshot;
  for (const f of AI_RELEVANT_FIELDS) out[f] = normaliseValue(draft[f]);
  return out;
}

function sameValue(a: SnapshotValue, b: SnapshotValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => x === b[i]);
  }
  return a === b;
}

/** AI-relevant fields that differ between the start-of-run snapshot and now. */
export function changedAiFields(snapshot: AiFieldSnapshot, draft: StudioDraft): AiRelevantField[] {
  const now = snapshotAiFields(draft);
  return AI_RELEVANT_FIELDS.filter((f) => !sameValue(snapshot[f], now[f]));
}

/** Human names for a list of changed fields ("Breed", "Opening line"). */
export function changedFieldLabels(fields: readonly AiRelevantField[]): string[] {
  return fields.map((f) => FIELD_LABELS[f] ?? f);
}

// ─────────────────────────────────────────────────────────────
// The conversation, as a state machine
// ─────────────────────────────────────────────────────────────

/**
 *   idle ─start→ opening ─reply→ awaitingTrainee ─send→ customerTyping ─reply→ …
 *                                      │                                  │
 *                               End & score                     token / 16-turn cap
 *                                      └──────────→ ended ←───────────────┘
 *                                                     │ (scoring starts at once)
 *                                                  scoring → scored | scoreFailed
 *
 * A failed customer turn does not get a phase of its own: it leaves an error
 * bubble (`error`) with a Retry, and the conversation waits in
 * `awaitingTrainee`. Every async result carries the `run` it belongs to, so
 * an answer that lands after a Restart is dropped instead of leaking into
 * the new conversation.
 */
export type SimPhase =
  | 'idle'
  | 'opening'
  | 'awaitingTrainee'
  | 'customerTyping'
  | 'ended'
  | 'scoring'
  | 'scored'
  | 'scoreFailed';

/** What a run is testing — frozen when the conversation starts. */
export interface SimConversation {
  scenario: Scenario;
  notes: SimulatorNotes;
  /** The draft's AI-relevant fields at the start, for the stale check. */
  snapshot: AiFieldSnapshot;
}

export interface SimError {
  /** 'opening' = the owner's first line never came; 'reply' = a later turn. */
  kind: 'opening' | 'reply';
  /** A short, human reason ("no connection to the server"). */
  reason: string;
  rateLimited: boolean;
}

export interface SimState {
  phase: SimPhase;
  run: number;
  convo: SimConversation | null;
  /** The canonical transcript — never holds error bubbles. */
  messages: ChatMessage[];
  error: SimError | null;
  endReason: EndReason | null;
  report: ScoreReport | null;
  /** Why the scorer call itself failed (thrown), when it did. */
  scoreError: SimError | null;
  /**
   * Set when a run reaches its end, cleared once the editor has been told
   * (`onTested`) — so a run that ends while the step is off screen is still
   * reported, exactly once, when the admin comes back.
   */
  testedPending: boolean;
}

export type SimAction =
  | { type: 'start'; run: number; convo: SimConversation }
  | { type: 'customerReplied'; run: number; message: ChatMessage }
  | { type: 'customerFailed'; run: number; error: Omit<SimError, 'kind'> }
  | { type: 'send'; message: ChatMessage }
  | { type: 'retry' }
  | { type: 'endManually' }
  | { type: 'scoreStarted' }
  | { type: 'scored'; run: number; report: ScoreReport }
  | { type: 'scoreFailed'; run: number; error: Omit<SimError, 'kind'> }
  | { type: 'testedAcknowledged' }
  | { type: 'restart'; run: number };

export function initialSimState(run = 0): SimState {
  return {
    phase: 'idle',
    run,
    convo: null,
    messages: [],
    error: null,
    endReason: null,
    report: null,
    scoreError: null,
    testedPending: false,
  };
}

/** Can the admin send a reply right now? */
export function canSend(state: SimState): boolean {
  return state.phase === 'awaitingTrainee' && state.error?.kind !== 'opening';
}

/** Can the admin end the conversation and score it right now? */
export function canEnd(state: SimState): boolean {
  return state.phase === 'awaitingTrainee' && traineeTurnCount(state.messages) >= 1;
}

export function isConversationActive(state: SimState): boolean {
  return (
    state.phase === 'opening' ||
    state.phase === 'awaitingTrainee' ||
    state.phase === 'customerTyping'
  );
}

export function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'start':
      if (state.phase !== 'idle') return state;
      return { ...initialSimState(action.run), phase: 'opening', convo: action.convo };

    case 'restart':
      return initialSimState(action.run);

    case 'customerReplied': {
      if (action.run !== state.run) return state;
      if (state.phase !== 'opening' && state.phase !== 'customerTyping') return state;
      const tokenSeen = hasEndToken(action.message.text);
      const text = stripEndToken(action.message.text);
      // A turn that was ONLY the token adds no bubble — the divider says it.
      const messages = text
        ? [...state.messages, { ...action.message, text }]
        : state.messages;
      const end = endReasonAfterCustomerTurn(customerTurnCount(messages), tokenSeen);
      if (end) {
        return { ...state, messages, error: null, phase: 'ended', endReason: end, testedPending: true };
      }
      return { ...state, messages, error: null, phase: 'awaitingTrainee' };
    }

    case 'customerFailed':
      if (action.run !== state.run) return state;
      if (state.phase !== 'opening' && state.phase !== 'customerTyping') return state;
      return {
        ...state,
        phase: 'awaitingTrainee',
        error: { ...action.error, kind: state.phase === 'opening' ? 'opening' : 'reply' },
      };

    case 'send': {
      if (!canSend(state)) return state;
      const text = action.message.text.trim().slice(0, MAX_REPLY_CHARS);
      if (!text) return state;
      return {
        ...state,
        messages: [...state.messages, { ...action.message, role: 'user', text }],
        error: null,
        phase: 'customerTyping',
      };
    }

    case 'retry':
      if (state.phase !== 'awaitingTrainee' || !state.error) return state;
      return {
        ...state,
        phase: state.error.kind === 'opening' ? 'opening' : 'customerTyping',
        error: null,
      };

    case 'endManually':
      if (!canEnd(state)) return state;
      return { ...state, phase: 'ended', endReason: 'manual', error: null, testedPending: true };

    case 'scoreStarted':
      if (state.phase !== 'ended' && state.phase !== 'scoreFailed') return state;
      return { ...state, phase: 'scoring', scoreError: null };

    case 'scored':
      if (action.run !== state.run || state.phase !== 'scoring') return state;
      if (isScoreUnavailable(action.report)) {
        return { ...state, phase: 'scoreFailed', report: null, scoreError: null };
      }
      return { ...state, phase: 'scored', report: normalizeScoreReport(action.report), scoreError: null };

    case 'scoreFailed':
      if (action.run !== state.run || state.phase !== 'scoring') return state;
      return { ...state, phase: 'scoreFailed', report: null, scoreError: { ...action.error, kind: 'reply' } };

    case 'testedAcknowledged':
      return state.testedPending ? { ...state, testedPending: false } : state;
  }
}

// ─────────────────────────────────────────────────────────────
// Errors, in plain words
// ─────────────────────────────────────────────────────────────

export const RATE_LIMIT_COPY = 'You’re going a little fast — wait a few seconds and try again.';

/**
 * Turn whatever `postJson` threw into a short reason. The server's own
 * messages are already written for people ("Too many requests — please slow
 * down."); the transport's are not ("Failed to fetch", "Request failed (502)").
 */
export function describeSimError(err: unknown): Omit<SimError, 'kind'> {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const msg = raw.trim();
  if (/\b429\b|too many|rate[\s_-]?limit|slow down/i.test(msg)) {
    return { reason: RATE_LIMIT_COPY, rateLimited: true };
  }
  if (/failed to fetch|networkerror|network error|load failed|network request failed/i.test(msg)) {
    return { reason: 'no connection to the server', rateLimited: false };
  }
  if (/not signed in/i.test(msg)) {
    return { reason: 'you’ve been signed out — sign in again', rateLimited: false };
  }
  if (/\((5\d\d)\)/.test(msg) || /upstream|unavailable|timed? ?out|not configured/i.test(msg)) {
    return { reason: 'the AI service had a hiccup', rateLimited: false };
  }
  if (!msg) return { reason: 'no reason given', rateLimited: false };
  const clipped = msg.length > 140 ? `${msg.slice(0, 139)}…` : msg;
  return { reason: clipped.replace(/[.\s]+$/, ''), rateLimited: false };
}

// ─────────────────────────────────────────────────────────────
// Composer helpers
// ─────────────────────────────────────────────────────────────

export interface TrySaying {
  kind: 'weak' | 'acknowledge' | 'clarify';
  /** A two-word label shown before the line. */
  label: string;
  text: string;
}

/**
 * A weak reply the owner should NOT be moved by, per objection — a
 * dismissive answer that skips acknowledging. `cost` is the canonical one.
 */
const WEAK_REPLIES: Record<string, string> = {
  cost: 'That’s just the price of good food.',
  'breeder-advice': 'Breeders aren’t vets — you should listen to us instead.',
  'raw-food': 'Grain-free is a myth, honestly.',
  'rx-diet': 'The vet prescribed it, so it’s necessary.',
  'brand-switch': 'Trust me, ours is just better.',
  'weight-denial': 'He’s overweight — the chart doesn’t lie.',
};
const GENERIC_WEAK_REPLY = 'That’s just what we recommend.';

/**
 * Three starters for admins who aren't sure what to type: one weak answer
 * (the owner should stay firm), one ACT-style acknowledge and one clarifying
 * question (the owner should soften).
 */
export function trySayingFor(pushbackId: string | null | undefined): TrySaying[] {
  return [
    {
      kind: 'weak',
      label: 'A weak reply',
      text: (pushbackId && WEAK_REPLIES[pushbackId]) || GENERIC_WEAK_REPLY,
    },
    { kind: 'acknowledge', label: 'Acknowledge', text: 'It sounds like you’re worried about…' },
    { kind: 'clarify', label: 'Ask to clarify', text: 'Can you tell me more about…' },
  ];
}

// ─────────────────────────────────────────────────────────────
// Missing fields → where to fix them
// ─────────────────────────────────────────────────────────────

/** The step that owns each label `missingScenarioFields` can return. */
export const MISSING_FIELD_STEP: Record<string, StudioStepKey> = {
  Breed: 'pet',
  'Life stage': 'pet',
  Pushback: 'pushback',
  'ECHO driver': 'customer',
};

/** How each missing field reads in a sentence ("Needs a breed and a life stage"). */
export const MISSING_FIELD_PHRASE: Record<string, string> = {
  Breed: 'a breed',
  'Life stage': 'a life stage',
  Pushback: 'a pushback',
  'ECHO driver': 'the owner’s ECHO driver',
};

/** Missing field labels grouped by the step that fixes them, in step order. */
export function groupMissingByStep(
  missing: readonly string[],
): Array<{ step: StudioStepKey; fields: string[] }> {
  const order: StudioStepKey[] = ['pet', 'pushback', 'customer'];
  const groups = new Map<StudioStepKey, string[]>();
  for (const label of missing) {
    const step = MISSING_FIELD_STEP[label] ?? 'pet';
    groups.set(step, [...(groups.get(step) ?? []), label]);
  }
  return order.filter((s) => groups.has(s)).map((step) => ({ step, fields: groups.get(step)! }));
}

/** Oxford-free English list: "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ─────────────────────────────────────────────────────────────
// Scorecard
// ─────────────────────────────────────────────────────────────

export const BAND_META: Record<ScoreReport['band'], { word: string; color: string; soft: string }> = {
  good: { word: 'Strong', color: COLOR.success, soft: COLOR.successSoft },
  ok: { word: 'On track', color: COLOR.warn, soft: COLOR.warnSoft },
  poor: { word: 'Needs work', color: COLOR.danger, soft: COLOR.dangerSoft },
};

/** Colour for one 0–100 value, on the scorer's own band thresholds. */
export function scoreColor(value: number): string {
  if (value >= 85) return COLOR.success;
  if (value >= 70) return COLOR.warn;
  return COLOR.danger;
}

export const SCORE_DIMENSIONS: ReadonlyArray<{
  key: 'acknowledge' | 'clarify' | 'transform' | 'empathy' | 'rapport';
  label: string;
}> = [
  { key: 'acknowledge', label: 'Acknowledge' },
  { key: 'clarify', label: 'Clarify' },
  { key: 'transform', label: 'Transform' },
  { key: 'empathy', label: 'Empathy' },
  { key: 'rapport', label: 'Rapport' },
];

export function clampScore(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface Verdict {
  tone: 'success' | 'warn' | 'info';
  headline: string;
  detail: string;
  /** A step that would move the scenario in the direction the verdict suggests. */
  fix?: { step: StudioStepKey; label: string };
}

/**
 * What the result says about the SCENARIO — the admin is checking the
 * scenario, not being trained. Reads the score together with where the
 * owner's mood ended up: a weak reply that scores low while the owner holds
 * firm is the scenario working, not failing.
 */
export function verdictFor(report: ScoreReport, messages: readonly ChatMessage[]): Verdict {
  const scoredWell = clampScore(report.overall) >= 70;
  const cameRound = latestEmotion(messages) === 'green';
  if (scoredWell && cameRound) {
    return {
      tone: 'success',
      headline: 'The scenario works: good handling scored well.',
      detail: 'The owner came round by the end — that’s the path your trainees should find.',
    };
  }
  if (scoredWell) {
    return {
      tone: 'warn',
      headline: 'Good handling scored well — but the owner never came round.',
      detail:
        'If that feels too hard for this level, lower the difficulty. Or keep it as a stretch scenario.',
      fix: { step: 'customer', label: 'Adjust the owner' },
    };
  }
  if (cameRound) {
    return {
      tone: 'warn',
      headline: 'The owner came round, but the handling scored low.',
      detail:
        'If the owner gives in too easily, raise the difficulty — or add a line about staying firm to the AI brief.',
      fix: { step: 'customer', label: 'Adjust the owner' },
    };
  }
  return {
    tone: 'info',
    headline: 'The owner held firm and the scorer caught the weak spots.',
    detail:
      'That’s what trainees should see when they skip acknowledging. To check the other side, run it again with an acknowledge-and-clarify reply — the owner should soften.',
  };
}
