/**
 * Scenario Studio — client calls.
 *
 * Every call goes through `postJson`, which forwards the admin's Supabase JWT.
 * The simulator talks to the SAME public AI functions the trainee app uses
 * (`ai-roleplay`, `ai-evaluate`), always with `preview: true` and
 * `allowTelemetry: false`: the server then honours the draft's unsaved AI
 * notes, records no telemetry, and writes no session or score.
 */
import { apiFetch, postJson } from '../lib/api';
import type {
  EvaluateRequest,
  EvaluateResponse,
  RoleplayRequest,
  RoleplayResponse,
  ScenarioAgentRequest,
  ScenarioAgentResponse,
  ScenarioInspectRequest,
  ScenarioInspectResponse,
} from '../../../src/shared/ai/contract';
import type { Scenario } from '../../../src/data/scenarios';
import type { ObjectionWriteRequest } from '../../../src/shared/scenarios/objections';
import type { ChatMessage, ScoreReport } from '../../../src/services/types';

/** Ask the Studio assistant for its next turn. */
export function askScenarioAgent(req: ScenarioAgentRequest): Promise<ScenarioAgentResponse> {
  return postJson<ScenarioAgentResponse>('admin-scenario-agent', req);
}

/** The exact customer prompt + retrieved passages for a draft. */
export function inspectScenario(req: ScenarioInspectRequest): Promise<ScenarioInspectResponse> {
  return postJson<ScenarioInspectResponse>('admin-scenario-inspect', req);
}

export interface SimulatorNotes {
  promptPrefix: string | null;
  promptSuffix: string | null;
  /** What a great answer includes — sent to the SCORER only (End & score). */
  successCriteria?: string | null;
}

/**
 * One AI-customer turn for the Test drive. `history` is the conversation so
 * far (empty = ask the customer to open). The draft's notes are ALWAYS sent,
 * even when empty — with `preview: true` and no `promptOverrides` object the
 * server would fall back to the SAVED row's notes, and the admin would be
 * testing something other than what is on screen.
 */
export async function simulateCustomerTurn(args: {
  scenario: Scenario;
  history: ChatMessage[];
  notes: SimulatorNotes;
}): Promise<ChatMessage> {
  const body: RoleplayRequest = {
    scenario: args.scenario,
    history: args.history,
    promptOverrides: {
      promptPrefix: args.notes.promptPrefix,
      promptSuffix: args.notes.promptSuffix,
    },
    preview: true,
    allowTelemetry: false,
    locale: 'en',
  };
  const res = await postJson<RoleplayResponse>('ai-roleplay', body);
  return res.message;
}

/**
 * Score a finished Test drive with the real rubric. Never persisted. The
 * draft's success criteria are ALWAYS sent (even empty), for the same reason
 * as the notes above: without them a preview would fall back to the saved
 * row's criteria.
 */
export async function simulateScore(args: {
  scenario: Scenario;
  transcript: ChatMessage[];
  successCriteria?: string | null;
}): Promise<ScoreReport> {
  const body: EvaluateRequest = {
    scenario: args.scenario,
    transcript: args.transcript,
    promptOverrides: { successCriteria: args.successCriteria ?? null },
    mode: 'text',
    preview: true,
    allowTelemetry: false,
    locale: 'en',
  };
  const res = await postJson<EvaluateResponse>('ai-evaluate', body);
  return res.report;
}

/**
 * What the database can store today. `species: false` on a project that has
 * not run the species migration (production has, since 2026-09-27).
 * Resolves `undefined` when unknown (an older server, a network blip) —
 * callers treat unknown as "don't block".
 */
export async function fetchScenarioCapabilities(): Promise<{ species?: boolean }> {
  try {
    const res = await apiFetch<unknown>('admin-scenario-overrides', { op: 'capabilities' });
    if (res && typeof res === 'object' && !Array.isArray(res)) {
      const species = (res as { species?: unknown }).species;
      return typeof species === 'boolean' ? { species } : {};
    }
    return {};
  } catch {
    return {};
  }
}

// ── Objections (admin-objections) ────────────────────────────────────────

/**
 * `admin-objections` GET — the team's objections AND the categories they live
 * in (built-ins merged in by the server). Always asks for the soft-deleted
 * ones too (`?deleted=1` — their `deletedAt` is set): the Categories tab
 * lists them under "Recently deleted", and the Studio needs to tell a DELETED
 * objection apart from an id it has never heard of. Rows are returned raw;
 * the store (./objections/useObjections) reads each one tolerantly.
 */
export function fetchObjections(): Promise<{ objections?: unknown; categories?: unknown; _notice?: unknown }> {
  return apiFetch<{ objections?: unknown; categories?: unknown; _notice?: unknown }>('admin-objections', {
    deleted: 1,
  });
}

/**
 * `admin-objections` POST — `upsert` / `delete` / `restore` for objections,
 * `upsert-category` / `delete-category` / `restore-category` for categories.
 * Throws an `ApiError` on non-2xx: 400 (`error` is a sentence for the admin),
 * 409 `{ code: 'stale', current }`, `{ code: 'in_use', scenarios }` (an
 * objection) or `{ code: 'in_use', objections }` (a category), `{ code:
 * 'limit' }`, 503 while the migration hasn't been applied. A category save
 * answers `{ category, _dropped? }` — document ids it left out.
 */
export function postObjectionOp(body: ObjectionWriteRequest): Promise<Record<string, unknown>> {
  return postJson<Record<string, unknown>>('admin-objections', body);
}
