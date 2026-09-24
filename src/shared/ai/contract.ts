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
 *     writes no telemetry and no session row.
 *   • `allowTelemetry` and `preview` let the caller REDUCE what is recorded
 *     about them (privacy opt-out, admin preview); they can never widen it.
 *   • Identity: when the app is signed in it sends the Supabase access token
 *     as `Authorization: Bearer …`. The server uses it to attribute
 *     telemetry and to write the score into the caller's own
 *     `training_sessions` row. Anonymous callers get the same AI behaviour
 *     with no persistence — anonymous-first is product design.
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

export const AI_ENDPOINTS = {
  roleplay: '/.netlify/functions/ai-roleplay',
  evaluate: '/.netlify/functions/ai-evaluate',
  hint: '/.netlify/functions/ai-hint',
  vision: '/.netlify/functions/ai-vision',
  fecalScan: '/.netlify/functions/ai-fecal-scan',
  voiceToken: '/.netlify/functions/ai-voice-token',
  /** Admin-only (requires `scenarios.write`). */
  scenarioSuggest: '/.netlify/functions/admin-scenario-ai',
} as const;

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

export interface EvaluateRequest extends AiRequestMeta {
  scenario: Scenario;
  transcript: ChatMessage[];
  mode: 'text' | 'voice';
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

// ─── Errors ────────────────────────────────────────────────────────────────

export type AiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'rate_limited'
  | 'payload_too_large'
  | 'upstream'
  | 'server';

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
