/**
 * Shared plumbing for the server-side AI functions (`ai-roleplay`,
 * `ai-hint`, `ai-evaluate`, `ai-vision`, `ai-voice-token`,
 * `admin-scenario-ai`).
 *
 * The trust boundary these helpers implement is spelled out in
 * `src/shared/ai/contract.ts`. In short:
 *   • the simulation config and admin prompt overrides are loaded HERE from
 *     the database — never read from the request (except preview overrides,
 *     which wrap the customer turn only);
 *   • the caller is identified from the Supabase JWT when one is sent, and
 *     an INVALID token is a 401 (never silently downgraded to anonymous);
 *   • anonymous callers are first-class — they get the AI, and no persistence;
 *   • telemetry is best-effort and never throws.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './admin';
import { retrieveChunks } from './retrieval';
import type { Difficulty, Scenario } from '../../../src/data/scenarios';
import type { ChatMessage } from '../../../src/services/types';
import type { PromptOverrides } from '../../../src/data/knowledge/promptBuilders';
import {
  resolveRag,
  type SimulationConfig,
} from '../../../src/data/knowledge/simulationConfig';
import type { RetrievedChunk } from '../../../src/services/ragShared';
import {
  AI_LIMITS,
  type AiErrorCode,
  type AiErrorResponse,
} from '../../../src/shared/ai/contract';
import type { AiCallRecord } from '../../../src/shared/ai/telemetryHeuristics';
import {
  scenarioRetrievalFilters,
  scenarioRetrievalQuery,
} from '../../../src/shared/ai/retrievalQuery';
import { DRIVER_KEYS } from '../../../src/design-system/tokens';
import { isScenarioSpecies } from '../../../src/shared/scenarios/species';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../../src/i18n/locales';

// ─── Responses ─────────────────────────────────────────────────────────────

/** AI responses are per-caller and must never be cached by a CDN/proxy. */
const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

export function ok<T>(json: T, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(json), {
    ...init,
    headers: { ...NO_STORE_HEADERS, ...(init.headers ?? {}) },
  });
}

export function aiError(
  status: number,
  code: AiErrorCode,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: AiErrorResponse = { error: message, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

/**
 * `requireAdmin` answers with the legacy `{ error }` shape. Admin-facing AI
 * endpoints promise an `AiErrorResponse`, so re-wrap it with a `code`.
 */
export async function adaptAdminError(res: Response): Promise<Response> {
  const body = (await res
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  const message = typeof body.error === 'string' ? body.error : 'Request rejected';
  const code: AiErrorCode =
    res.status === 401 || res.status === 403 ? 'unauthorized' : 'server';
  return aiError(res.status, code, message);
}

// ─── Small utilities ───────────────────────────────────────────────────────

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RX.test(value);
}

export function readLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function envFirst(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}

/**
 * Same retry budget the browser used: two attempts, 1.2 s apart. A single
 * transient blip must not surface to the trainee.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  delayMs = 1200,
): Promise<{ value: T; retries: number }> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn();
      return { value, retries: i };
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

export interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

export function readUsage(response: unknown): UsageMetadata {
  if (!response || typeof response !== 'object') return {};
  const meta = (response as { usageMetadata?: UsageMetadata }).usageMetadata;
  return meta ?? {};
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Caller identity ───────────────────────────────────────────────────────

export interface Caller {
  /** Supabase auth user id, or null for an anonymous caller. */
  userId: string | null;
  /**
   * Service-role client. Anonymous callers get one too: the simulation
   * config and the telemetry table are admin-only under RLS. Every WRITE
   * made through it must be scoped explicitly (see `ai-evaluate`).
   */
  sb: SupabaseClient;
}

/**
 * Identify the caller. No `Authorization` header → anonymous (by design —
 * anonymous-first is product). A header that is present but does not verify
 * → 401: a stale or forged token must never be quietly treated as anonymous,
 * or a signed-in user's score could silently fail to persist.
 */
export async function readCaller(req: Request): Promise<Caller | Response> {
  let sb: SupabaseClient;
  try {
    sb = getServiceClient();
  } catch (err) {
    console.error('[ai] service client unavailable', errorMessage(err));
    return aiError(500, 'server', 'Server misconfigured');
  }

  const auth = req.headers.get('authorization');
  if (!auth) return { userId: null, sb };
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return aiError(401, 'unauthorized', 'Malformed Authorization header');
  }
  const token = auth.slice('bearer '.length).trim();
  if (!token) return aiError(401, 'unauthorized', 'Missing bearer token');

  const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = envFirst(
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  );
  if (!url || !anonKey) {
    console.error('[ai] env missing: SUPABASE_URL / SUPABASE_ANON_KEY');
    return aiError(500, 'server', 'Server misconfigured');
  }

  // Anon client — used only to verify the caller's JWT (same as requireUser).
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return aiError(401, 'unauthorized', 'Invalid token');

  // An already-issued access token outlives the Auth ban set by
  // admin-user-actions, so a disabled account must be rejected here too.
  const { data: profile } = await sb
    .from('profiles')
    .select('disabled')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (profile?.disabled) return aiError(403, 'unauthorized', 'Account disabled');

  return { userId: data.user.id, sb };
}

// ─── Rate limiting ─────────────────────────────────────────────────────────

/**
 * Best-effort sliding-window limiter keyed by client IP per bucket.
 *
 * This lives in function-instance memory, so it is per instance and resets
 * on cold start — good enough to blunt a runaway loop or a casual script,
 * NOT a durable quota. Netlify's Rate Limiting rules (Pro plan, configured in
 * netlify.toml / the UI) are the durable layer to add on top; they apply
 * before the function is even invoked.
 */
const RATE_MAX_KEYS = 5000;
const rateWindows = new Map<string, number[]>();

export function clientIp(req: Request): string {
  const nf = req.headers.get('x-nf-client-connection-ip')?.trim();
  if (nf) return nf;
  const xff = req.headers.get('x-forwarded-for');
  const first = xff?.split(',')[0]?.trim();
  return first || 'unknown';
}

export function rateLimit(
  req: Request,
  bucket: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): Response | null {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  // Bound the map so a scan of spoofed IPs can't grow it without limit.
  if (rateWindows.size > RATE_MAX_KEYS) rateWindows.clear();
  const hits = (rateWindows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    rateWindows.set(key, hits);
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
    return aiError(429, 'rate_limited', 'Too many requests — please slow down.', {
      'retry-after': String(retryAfterSec),
    });
  }
  hits.push(now);
  rateWindows.set(key, hits);
  return null;
}

/** Test hook — limiter state is module-level. */
export function __resetRateLimits(): void {
  rateWindows.clear();
}

// ─── Body parsing ──────────────────────────────────────────────────────────

/**
 * POST-only JSON body, bounded in size. `content-length` is checked first so
 * an oversized declared body is refused before it is read; the actual bytes
 * are checked again after reading because the header is optional.
 */
export async function parseJsonBody<T>(
  req: Request,
  maxBytes: number,
): Promise<{ body: T } | Response> {
  if (req.method !== 'POST') {
    return aiError(405, 'bad_request', 'Method not allowed', { allow: 'POST' });
  }
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) {
    return aiError(413, 'payload_too_large', `Body exceeds ${maxBytes} bytes`);
  }
  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return aiError(400, 'bad_request', 'Unreadable request body');
  }
  if (buf.byteLength > maxBytes) {
    return aiError(413, 'payload_too_large', `Body exceeds ${maxBytes} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return aiError(400, 'bad_request', 'Body must be valid JSON');
  }
  if (!isPlainObject(parsed)) {
    return aiError(400, 'bad_request', 'Body must be a JSON object');
  }
  return { body: parsed as T };
}

// ─── Server-loaded configuration ───────────────────────────────────────────

const CONFIG_TTL_MS = 60_000;
let simCache: { value: SimulationConfig | undefined; expiresAt: number } | null = null;

/**
 * The global admin simulation config (scoring weights/prompt, driver +
 * pushback edits). THIS IS THE ONLY SOURCE OF THE SIMULATION CONFIG — it is
 * never read from the request, so a client cannot re-weight its own score.
 * Cached in-module for 60 s (same TTL as the flags snapshot the browser
 * sees). On a read error the last good value is served rather than nothing.
 */
export async function loadSimulationConfig(
  sb: SupabaseClient,
): Promise<SimulationConfig | undefined> {
  const now = Date.now();
  if (simCache && simCache.expiresAt > now) return simCache.value;
  try {
    const { data, error } = await sb
      .from('simulation_config')
      .select('config')
      .eq('id', 'global')
      .maybeSingle();
    if (error) {
      console.warn('[ai] simulation_config fetch failed', error.message);
      return simCache?.value;
    }
    const raw = (data as { config?: unknown } | null)?.config;
    const value = isPlainObject(raw) ? (raw as SimulationConfig) : undefined;
    simCache = { value, expiresAt: now + CONFIG_TTL_MS };
    return value;
  } catch (err) {
    console.warn('[ai] simulation_config fetch threw', errorMessage(err));
    return simCache?.value;
  }
}

const overrideCache = new Map<
  string,
  { value: PromptOverrides | undefined; expiresAt: number }
>();

function clampOverride(v: unknown): string | null {
  return typeof v === 'string' ? v.slice(0, AI_LIMITS.maxOverrideChars) : null;
}

/**
 * Per-scenario admin prompt prefix/suffix.
 *
 * Accepted from the request ONLY when `preview === true` (the admin Scenario
 * Builder drives an unsaved draft), clamped to the same length the
 * `scenario_overrides` CHECK enforces. Otherwise loaded from
 * `scenario_overrides` by `scenario._overrideId` (cached 60 s per id).
 */
export async function loadPromptOverrides(
  sb: SupabaseClient,
  scenario: Scenario,
  body: { preview?: unknown; promptOverrides?: unknown },
): Promise<PromptOverrides | undefined> {
  if (body.preview === true && isPlainObject(body.promptOverrides)) {
    return {
      promptPrefix: clampOverride(body.promptOverrides.promptPrefix),
      promptSuffix: clampOverride(body.promptOverrides.promptSuffix),
    };
  }
  const id = scenario._overrideId;
  if (typeof id !== 'string' || !id) return undefined;

  const now = Date.now();
  const hit = overrideCache.get(id);
  if (hit && hit.expiresAt > now) return hit.value;
  try {
    const { data, error } = await sb
      .from('scenario_overrides')
      .select('prompt_prefix, prompt_suffix')
      .eq('scenario_id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) {
      console.warn('[ai] scenario_overrides fetch failed', error.message);
      return hit?.value;
    }
    const row = data as { prompt_prefix?: string | null; prompt_suffix?: string | null } | null;
    const value: PromptOverrides | undefined = row
      ? { promptPrefix: row.prompt_prefix ?? null, promptSuffix: row.prompt_suffix ?? null }
      : undefined;
    if (overrideCache.size > 1000) overrideCache.clear();
    overrideCache.set(id, { value, expiresAt: now + CONFIG_TTL_MS });
    return value;
  } catch (err) {
    console.warn('[ai] scenario_overrides fetch threw', errorMessage(err));
    return hit?.value;
  }
}

/** Test hook — config + override caches are module-level. */
export function __resetAiCaches(): void {
  simCache = null;
  overrideCache.clear();
}

/**
 * RAG grounding for a scenario — the same query + filters both browser modes
 * used, gated by the admin `rag` knobs. Fail-open: any failure is `[]`.
 *
 * `tool` is the knowledge scope this consumer retrieves AS (see
 * `src/shared/knowledge/knowledgeScopes.ts`): only documents an admin filed
 * for that tool can come back, on every fallback path. Required rather than
 * defaulted — an unscoped caller would quietly read the whole corpus.
 */
export async function retrieveForScenario(
  sb: SupabaseClient,
  scenario: Scenario,
  config: SimulationConfig | undefined,
  tool: string,
): Promise<RetrievedChunk[]> {
  try {
    const rag = resolveRag(config);
    if (!rag.enabled) return [];
    return await retrieveChunks(scenarioRetrievalQuery(scenario), {
      k: rag.k,
      filters: { ...scenarioRetrievalFilters(scenario), tool },
      sb,
    });
  } catch {
    return [];
  }
}

// ─── Telemetry ─────────────────────────────────────────────────────────────

function isFkViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23503') return true;
  return /foreign key/i.test(error.message ?? '');
}

/**
 * Server-side twin of the browser's `recordCall`. Same columns; the caller
 * decides attribution. Skipped when the trainee opted out of training use
 * (`allowTelemetry === false`) or for an admin preview. Best-effort: never
 * throws, and a `session_id` the FK does not (yet) know about is retried as
 * null rather than losing the row.
 */
export async function recordCallServer(
  sb: SupabaseClient,
  rec: AiCallRecord & { userId: string | null },
  opts: { allowTelemetry?: boolean; preview?: boolean } = {},
): Promise<void> {
  if (opts.allowTelemetry === false || opts.preview === true) return;
  const sessionId = isUuid(rec.sessionId) ? rec.sessionId : null;
  const row = {
    session_id: sessionId,
    user_id: rec.userId,
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
  };
  try {
    const { error } = await sb.from('ai_call_telemetry').insert(row);
    if (!error) return;
    if (sessionId && isFkViolation(error)) {
      // The training_sessions row may not exist yet (the client persists it
      // after scoring) — keep the call, drop the attribution.
      const retry = await sb.from('ai_call_telemetry').insert({ ...row, session_id: null });
      if (retry.error) console.warn('[ai-telemetry] insert retry failed', retry.error.message);
      return;
    }
    console.warn('[ai-telemetry] insert failed', error.message);
  } catch (err) {
    console.warn('[ai-telemetry] recordCallServer threw', errorMessage(err));
  }
}

// ─── Input sanitising ──────────────────────────────────────────────────────

/**
 * Keep only well-formed turns, drop transient-error sentinels, clamp text
 * length, and keep the most recent `maxTurns` (the recent context is what
 * matters to the customer; the caps sit well above the session turn caps).
 */
export function sanitizeTurns(
  input: unknown,
  maxTurns: number = AI_LIMITS.maxTurns,
  maxChars: number = AI_LIMITS.maxTurnChars,
): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) continue;
    if (raw._transientError) continue;
    const role = raw.role === 'user' || raw.role === 'ai' ? raw.role : null;
    if (!role || typeof raw.text !== 'string') continue;
    const turn: ChatMessage = {
      role,
      text: raw.text.slice(0, maxChars),
      timestamp:
        typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
          ? raw.timestamp
          : Date.now(),
    };
    if (raw.emotion === 'red' || raw.emotion === 'yellow' || raw.emotion === 'green') {
      turn.emotion = raw.emotion;
    }
    out.push(turn);
  }
  return out.length > maxTurns ? out.slice(out.length - maxTurns) : out;
}

const OPTIONAL_STRING_FIELDS = [
  'context',
  'pushbackNotes',
  'openingLine',
  'weightKg',
  'focusArea',
  '_overrideId',
] as const;

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Structural validation of a client-supplied scenario. The scenario is the
 * trainee's own content and passes through as-is — but the prompt builders
 * dereference these fields (an unknown driver would throw inside
 * `resolveDriverKnowledge`), so the shape is enforced. Returns null → 400.
 */
export function sanitizeScenario(input: unknown): Scenario | null {
  if (!isPlainObject(input)) return null;
  const s = input;
  if (!nonEmptyString(s.breed) || !nonEmptyString(s.age) || !nonEmptyString(s.persona)) {
    return null;
  }
  if (
    !isPlainObject(s.pushback) ||
    !nonEmptyString(s.pushback.id) ||
    !nonEmptyString(s.pushback.title)
  ) {
    return null;
  }
  if (s.pushback.example !== undefined && typeof s.pushback.example !== 'string') return null;
  if (!(DRIVER_KEYS as readonly string[]).includes(s.suggestedDriver as string)) return null;
  if (typeof s.difficulty !== 'number' || !Number.isFinite(s.difficulty)) return null;

  const out: Record<string, unknown> = { ...s };
  out.difficulty = Math.max(1, Math.min(4, Math.round(s.difficulty))) as Difficulty;
  for (const key of OPTIONAL_STRING_FIELDS) {
    const v = s[key];
    if (v === undefined || v === null) {
      delete out[key];
      continue;
    }
    if (typeof v !== 'string') return null;
  }
  if (s.knowledgeSlugs !== undefined && s.knowledgeSlugs !== null) {
    if (
      !Array.isArray(s.knowledgeSlugs) ||
      !s.knowledgeSlugs.every((x) => typeof x === 'string')
    ) {
      return null;
    }
  } else {
    delete out.knowledgeSlugs;
  }
  // `species` switches the prompt wording and the HARD knowledge scope, so
  // only the two values the prompt builders know may pass. Anything else is
  // dropped (not rejected): the scenario simply runs as the dog it would
  // have been before species existed.
  if (!isScenarioSpecies(s.species)) delete out.species;
  return out as unknown as Scenario;
}
