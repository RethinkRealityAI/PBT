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

/** Score a finished Test drive with the real rubric. Never persisted. */
export async function simulateScore(args: {
  scenario: Scenario;
  transcript: ChatMessage[];
}): Promise<ScoreReport> {
  const body: EvaluateRequest = {
    scenario: args.scenario,
    transcript: args.transcript,
    mode: 'text',
    preview: true,
    allowTelemetry: false,
    locale: 'en',
  };
  const res = await postJson<EvaluateResponse>('ai-evaluate', body);
  return res.report;
}

/**
 * What the database can store today. `species: false` while the deferred
 * species migration is pending. Resolves `undefined` when unknown (an older
 * server, a network blip) — callers treat unknown as "don't block".
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
