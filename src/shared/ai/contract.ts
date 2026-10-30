/**
 * Wire contract between the consumer / admin apps and the server-side AI
 * functions under `netlify/functions/ai-*`.
 *
 * WHY THIS EXISTS — the Gemini API key used to be compiled into the browser
 * bundle. Every AI call now goes through a Netlify Function that holds the
 * key; the browser never sees it. Live voice is the one path that must
 * connect from the device, and it does so with a single-use ephemeral token
 * minted by `ai-voice-token`, never the long-lived key.
 *
 * Trust boundary (read this before adding a field):
 *   • The server is AUTHORITATIVE for anything that affects scoring or the
 *     system prompt's rubric: the simulation config is loaded from the
 *     database on the server and is NEVER accepted from the client.
 *   • `scenario`, `history` / `transcript` and `userMessage` are user content
 *     by definition — a trainee's own conversation — and are accepted as-is,
 *     bounded in size.
 *   • `promptOverrides` (admin prompt prefix/suffix) are loaded server-side
 *     from `scenario_overrides` by `scenario._overrideId`. They are accepted
 *     from the client ONLY when `preview === true` (the admin Scenario
 *     Builder's "Test in app" iframe drives an unsaved draft). They wrap the
 *     customer turn only and never touch the scorer, so a non-admin abusing
 *     the flag can only alter their own role-play — and a preview call
 *     writes no telemetry and no session row. The one scorer-side override,
 *     `successCriteria` (the scenario's "what a great answer includes"),
 *     follows the same rule: server-loaded, or from the body only in a
 *     preview, which never writes a score — so it can only change an
 *     admin's own unrecorded test grade.
 *   • `allowTelemetry` and `preview` let the caller REDUCE what is recorded
 *     about them (privacy opt-out, admin preview); they can never widen it.
 *   • Identity: when the app is signed in it sends the Supabase access token
 *     as `Authorization: Bearer …`. The server uses it to attribute
 *     telemetry and to write the score into the caller's own
 *     `training_sessions` row. Anonymous callers get the same AI behaviour
 *     — anonymous-first is product design — and their sessions are recorded
 *     WITHOUT identifying details: the server (never the browser) writes a
 *     `training_sessions` row owned by `anonSessionId`, the random per-device
 *     id the app already keeps (`pbt:session_id`), via `session-save` (the
 *     conversation) and `ai-evaluate` (the score). An anonymous row can only
 *     be updated by a request carrying the same device id, never one owned by
 *     an account, and nothing is written with `allowTelemetry: false` or in a
 *     preview.
 */
import type { Scenario } from '../../data/scenarios';
import type { ChatMessage, ScoreReport } from '../../services/types';
import type { PromptOverrides } from '../../data/knowledge/promptBuilders';
import type { Locale } from '../../i18n/locales';
import type { PetVisionResult } from './petVision';
import type {
  FecalBreedSize,
  FecalScanResult,
  FecalScanRetrieval,
  FecalSpecies,
} from './fecalScan';
import type { ScenarioDraftForAi, WizardField } from './scenarioWizard';
import type {
  AgentTurn,
  ScenarioAgentAction,
  ScenarioAgentDraft,
  StudioStepKey,
} from './scenarioAgent';

export const AI_ENDPOINTS = {
  roleplay: '/.netlify/functions/ai-roleplay',
  evaluate: '/.netlify/functions/ai-evaluate',
  hint: '/.netlify/functions/ai-hint',
  vision: '/.netlify/functions/ai-vision',
  fecalScan: '/.netlify/functions/ai-fecal-scan',
  voiceToken: '/.netlify/functions/ai-voice-token',
  /** Admin-only (requires `scenarios.write`). */
  scenarioSuggest: '/.netlify/functions/admin-scenario-ai',
  /** Admin-only (requires `scenarios.write`) — the Scenario Studio assistant. */
  scenarioAgent: '/.netlify/functions/admin-scenario-agent',
  /** Admin-only (requires `scenarios.read`) — exact prompt + retrieval for a draft. */
  scenarioInspect: '/.netlify/functions/admin-scenario-inspect',
  /** Anonymous session recording (no AI call) — see `SessionSaveRequest`. */
  sessionSave: '/.netlify/functions/session-save',
} as const;

/**
 * Shape of the per-device anonymous id (`pbt:session_id`, a UUID today).
 * Bounded so a request can't store an arbitrary string as an owner key; the
 * `training_sessions_anon_session_id_check` CHECK enforces the same length.
 */
export const ANON_SESSION_ID_RX = /^[A-Za-z0-9_-]{8,64}$/;

export function isAnonSessionId(value: unknown): value is string {
  return typeof value === 'string' && ANON_SESSION_ID_RX.test(value);
}

/** Fields every AI request may carry. */
export interface AiRequestMeta {
  /** PBT session id (`training_sessions.id`). Telemetry rows attribute to it. */
  sessionId?: string | null;
  /** App locale — the language the customer speaks / coaching is written in. */
  locale?: Locale;
  /**
   * The trainee's privacy opt-out (`pbt:allow_training_use`). `false` stops
   * the server writing `ai_call_telemetry` for this call. Defaults to true.
   */
  allowTelemetry?: boolean;
  /**
   * Admin "Test in app" preview: the AI call really happens but nothing is
   * recorded (no telemetry, no session row). Defaults to false.
   */
  preview?: boolean;
}

// ─── Text role-play ────────────────────────────────────────────────────────

export interface RoleplayRequest extends AiRequestMeta {
  scenario: Scenario;
  /** Prior turns, transient errors already stripped. May be empty (opening). */
  history: ChatMessage[];
  userMessage?: string;
  /** Honoured ONLY when `preview === true`; otherwise loaded server-side. */
  promptOverrides?: PromptOverrides;
}

export interface RoleplayResponse {
  message: ChatMessage;
}

// ─── Scoring ───────────────────────────────────────────────────────────────

/**
 * Why a conversation stopped before its natural close. The scorer gets a
 * FIXED server-written note for each value (never client text), telling it to
 * grade the staff turns that happened rather than the missing close.
 */
export type EndedEarly = 'time_limit' | 'interrupted';

export const ENDED_EARLY_VALUES: readonly EndedEarly[] = ['time_limit', 'interrupted'];

export interface EvaluateRequest extends AiRequestMeta {
  scenario: Scenario;
  transcript: ChatMessage[];
  mode: 'text' | 'voice';
  /**
   * Honoured ONLY when `preview === true` (the Studio's Test drive scoring an
   * unsaved draft), and only `successCriteria` is read; otherwise the
   * criteria are loaded server-side by `scenario._overrideId`.
   */
  promptOverrides?: PromptOverrides;
  /**
   * The anonymous device id (`pbt:session_id`). Read ONLY when the caller is
   * not signed in: the score is then written into that device's anonymous
   * `training_sessions` row (created if missing). Ignored for signed-in
   * callers, previews and `allowTelemetry: false`.
   */
  anonSessionId?: string;
  /** Set when the conversation stopped early — see `EndedEarly`. */
  endedEarly?: EndedEarly;
}

export interface EvaluateResponse {
  /**
   * The scorecard. On upstream failure the server returns HTTP 200 with a
   * report flagged `scoreUnavailable: true` (never a fake zero) — identical
   * to the pre-refactor client behaviour, so `isScoreUnavailable()` keeps
   * working unchanged.
   */
  report: ScoreReport;
  /**
   * True when the server wrote `score_report` into the caller's own
   * `training_sessions` row (signed-in, non-preview, real score). The client
   * never writes score columns itself — a database trigger rejects it.
   */
  persisted: boolean;
}

// ─── Anonymous session recording ──────────────────────────────────────────

/** How a session ended — the `training_sessions.ended_reason` CHECK values. */
export type SessionEndedReason = 'completed' | 'abandoned' | 'timeout' | 'error' | 'user_exit';

/**
 * `session-save` — records the conversation of an ANONYMOUS session when it
 * ends or is left (signed-in sessions are upserted by the app itself, under
 * RLS). No AI call. The row is owned by `anonSessionId`; it never carries a
 * score (only `ai-evaluate` writes those) and a row owned by an account or by
 * another device is never touched.
 */
export interface SessionSaveRequest extends AiRequestMeta {
  sessionId: string;
  anonSessionId: string;
  scenario: Scenario;
  transcript: ChatMessage[];
  mode: 'text' | 'voice';
  completed: boolean;
  /** Required unless `checkpoint` (an in-progress save records no ending). */
  endedReason?: SessionEndedReason;
  durationSeconds: number;
  /**
   * A mid-conversation save (after each exchange), so an interrupted session
   * — closed tab, dropped connection — still reaches the database and can be
   * scored later (`sessions-recover`). Recorded as in progress (`completed:
   * false`, no `ended_reason`) and only ever applied to a row that is STILL
   * in progress: a late checkpoint can never reopen a finished session.
   */
  checkpoint?: boolean;
}

export interface SessionSaveResponse {
  persisted: boolean;
  /**
   * Why nothing was written, when `persisted` is false. `limit` = this device
   * already created its daily allowance of rows (`ANON_DAILY_CAP`).
   */
  skipped?: 'signed_in' | 'opted_out' | 'preview' | 'not_owner' | 'limit' | 'failed';
}

/**
 * `session-save` with `claim: true` — a trainee who practised anonymously and
 * then signed in hands over the ids of the sessions in their device's local
 * history; the anonymous rows of THAT device among them become theirs.
 * Signed-in callers only. A database failure is an error status (not an empty
 * list), so the app knows it cannot tell its rows apart and skips the upload.
 */
export interface SessionClaimRequest {
  claim: true;
  anonSessionId: string;
  sessionIds: string[];
}

export interface SessionClaimResponse {
  /**
   * Ids now owned by the caller. `complete: false` = a row rebuilt from app
   * activity (no transcript) that the app should fill from its local copy.
   */
  claimed: Array<{ id: string; complete: boolean }>;
}

// ─── Coach hint ────────────────────────────────────────────────────────────

export interface HintRequest extends AiRequestMeta {
  scenario: Scenario;
  history: ChatMessage[];
}

export interface HintResponse {
  hint: string;
}

// ─── Pet Vision ────────────────────────────────────────────────────────────

export interface VisionRequest extends AiRequestMeta {
  /** Raw base64 (no data-URL prefix). Client downscales before sending. */
  imageBase64: string;
  mimeType: string;
}

export interface VisionResponse {
  result: PetVisionResult;
}

// ─── Fecal Scan ────────────────────────────────────────────────────────────

export interface FecalScanRequest extends AiRequestMeta {
  /** Raw base64 (no data-URL prefix). Client downscales before sending. */
  imageBase64: string;
  mimeType: string;
  /** Which Royal Canin chart to score against. */
  species: FecalSpecies;
  /** Puppies only — score 3 is banded by breed size on the chart. */
  breedSize?: FecalBreedSize;
}

export interface FecalScanResponse {
  result: FecalScanResult;
  /** What the scorer was grounded in — surfaced in the UI as the RAG trail. */
  retrieval: FecalScanRetrieval;
}

// ─── Live voice — ephemeral token ──────────────────────────────────────────

export interface VoiceTokenRequest extends AiRequestMeta {
  scenario: Scenario;
  /** Localized opening line the customer must deliver first (if any). */
  openingLine?: string | null;
  /** Honoured ONLY when `preview === true`; otherwise loaded server-side. */
  promptOverrides?: PromptOverrides;
  /**
   * The same audience the app sends `flags-resolve` (device id + the
   * trainee's ECHO driver), so the server resolves the *Voice mode in chat*
   * switch with the same targeting rules the app used. Hints only: the
   * signed-in user id always comes from the verified token, and flags are
   * configuration, not an access control.
   */
  audience?: {
    anonSessionId?: string | null;
    driver?: string | null;
  };
}

export interface VoiceTokenResponse {
  /**
   * Ephemeral token name. Used as the `apiKey` for `new GoogleGenAI({...})`
   * with `httpOptions: { apiVersion: 'v1alpha' }`. Single use; the Live
   * connection it opens has the model + system prompt + tools LOCKED
   * server-side, so the browser cannot alter them.
   */
  token: string;
  /** The Live model the token is constrained to. */
  model: string;
  /** ISO — after this, messages in the session are rejected. */
  expiresAt: string;
  /** ISO — after this, the token can no longer OPEN a session. */
  newSessionExpiresAt: string;
}

// ─── Admin Scenario Builder wizard ─────────────────────────────────────────

export interface ScenarioSuggestRequest {
  field: WizardField;
  draft: ScenarioDraftForAi;
}

export interface ScenarioSuggestResponse {
  suggestions: string[];
}

// ─── Admin Scenario Studio assistant ───────────────────────────────────────
//
// See src/shared/ai/scenarioAgent.ts for the action vocabulary and the
// normaliser both sides run. The server never writes anything: it returns a
// reply plus PROPOSALS the admin reviews on cards.

export interface ScenarioAgentRequest {
  /** The conversation so far, oldest first, ending on the admin's turn. */
  messages: AgentTurn[];
  /** The on-screen (unsaved) draft — prompt context only. */
  draft: ScenarioAgentDraft;
  /** The Studio step the admin is looking at. */
  step?: StudioStepKey;
}

export interface ScenarioAgentResponse {
  /** 1–4 plain sentences, no markdown. */
  reply: string;
  /** Normalised proposals (≤ 3); the client re-normalises before applying. */
  actions: ScenarioAgentAction[];
  /** ≤ 3 short follow-up prompts shown as chips. */
  suggestions: string[];
}

// ─── Admin Scenario Studio inspector ───────────────────────────────────────
//
// "What exactly will the AI customer be told, and what will it read?" — the
// server builds the scenario from the draft, loads the live simulation
// config, runs the real roleplay retrieval, and returns both. Read-only.

export interface ScenarioInspectRequest {
  draft: ScenarioAgentDraft;
  /** What to compute. Both default to true. */
  include?: { prompt?: boolean; knowledge?: boolean };
}

export interface InspectPassage {
  slug: string | null;
  title: string | null;
  citation: string | null;
  /** The chunk text, trimmed for display (≤ ~700 chars). */
  snippet: string;
  similarity: number | null;
}

export interface ScenarioInspectResponse {
  /**
   * Fields the draft is missing before a customer can be built (human
   * labels). When non-empty, `prompt` is null and `knowledge.passages` empty.
   */
  missing: string[];
  /** The exact text-mode customer system prompt, or null. */
  prompt: string | null;
  /** The admin text wrapped around the canonical brief, for highlighting. */
  adminNotes: {
    scenarioPrefix: string | null;
    scenarioSuffix: string | null;
    globalPrefix: string | null;
    globalSuffix: string | null;
  };
  /**
   * Whose knowledge the scenario reads (`effectiveKnowledge`): its OWN
   * choice (documents or a topic on the Knowledge step), its CATEGORY's
   * (the scenario chose none and its objection's category has knowledge
   * attached), or the whole `library`. Optional: absent from an older server.
   */
  knowledgeSource?: 'scenario' | 'category' | 'library';
  /**
   * The category the draft's objection belongs to (server-loaded, fresh),
   * whether or not its knowledge is used — so the Studio can say "Using
   * Probiotics' knowledge" or "Your documents replace Probiotics' knowledge".
   * Null for "Other pushback", an unknown objection, or a deleted category.
   */
  knowledgeCategory?: {
    id: string;
    name: string;
    focusArea: string | null;
    knowledgeSlugs: string[];
  } | null;
  knowledge: {
    /** False when research grounding is switched off in AI tuning. */
    enabled: boolean;
    /** Passages retrieved per conversation (config `rag.k`). */
    k: number;
    /**
     * What retrieval actually targets — the EFFECTIVE knowledge, so a
     * scenario reading its category's documents is `documents` (see
     * `knowledgeSource` for whose they are).
     */
    mode: 'library' | 'focus' | 'documents';
    /** The retrieval scope actually applied (tool, species, focus, docSlugs). */
    appliedFilter: Record<string, unknown>;
    /** True when a focus filter found nothing and the search widened. */
    focusRelaxed: boolean;
    /**
     * True when the category's documents gave nothing readable for this
     * scenario (filed for another animal or tool) and the search widened to
     * the scope — a real session does the same. Optional: older servers omit it.
     */
    docsRelaxed?: boolean;
    passages: InspectPassage[];
  };
}

// ─── Errors ────────────────────────────────────────────────────────────────

export type AiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'payload_too_large'
  | 'upstream'
  | 'server'
  /** An admin has switched the feature off (e.g. *Voice mode in chat*). */
  | 'disabled';

export interface AiErrorResponse {
  error: string;
  code: AiErrorCode;
}

/** Payload bounds enforced server-side (mirrored client-side where cheap). */
export const AI_LIMITS = {
  /** Turns the roleplay/hint/evaluate functions will read. */
  maxTurns: 64,
  /** Characters per turn. */
  maxTurnChars: 4_000,
  /** Characters of a single user message. */
  maxUserMessageChars: 2_000,
  /** Base64 characters for a vision image (≈ 3 MB of JPEG). */
  maxImageBase64Chars: 4_200_000,
  /** Prompt prefix / suffix (matches the `scenario_overrides` CHECK). */
  maxOverrideChars: 1_500,
} as const;
