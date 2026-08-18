/**
 * Simulation config — version history, restore, and labelled saves.
 *
 * The version history is not a new table: every simulation save already writes
 * an `admin_audit_log` row carrying the FULL before/after config, so the audit
 * log IS the history. These helpers wrap the `?op=history` / `?op=restore` ops
 * on `admin-simulation-config`.
 *
 * Auth + error contract mirror `data/queries.ts` (both go through the shared
 * `apiFetch` / `postJson` in `lib/api.ts`, which forward the Supabase JWT).
 */
import { apiFetch } from '../lib/api';
import { getAccessToken } from '../lib/supabase';

export interface SimulationVersion {
  id: string;
  created_at: string;
  actor_id: string | null;
  /** Best-effort — null when the Auth lookup was unavailable. */
  actor_email: string | null;
  action: string;
  note: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** Last 30 days of saved simulation-config versions, newest first. */
export function fetchSimulationHistory(): Promise<SimulationVersion[]> {
  return apiFetch<{ versions: SimulationVersion[] }>('admin-simulation-config', {
    op: 'history',
  }).then((res) => res.versions ?? []);
}

export interface SimulationSaveResult {
  config: Record<string, unknown>;
  updated_at: string | null;
}

/**
 * Someone else saved the config between our GET and our POST.
 *
 * The server answers 409 `{ error: 'conflict', updated_at }` whenever the
 * `baseUpdatedAt` we sent is stale. It carries THEIR `updated_at` so the
 * screen can offer "reload their version" or "save anyway" without a
 * second round trip.
 */
export class SimulationConflictError extends Error {
  readonly updatedAt: string | null;
  constructor(updatedAt: string | null) {
    super('Someone else saved these settings while you were editing.');
    this.name = 'SimulationConflictError';
    this.updatedAt = updatedAt;
  }
}

export function isSimulationConflict(err: unknown): err is SimulationConflictError {
  return err instanceof SimulationConflictError;
}

/**
 * POST to admin-simulation-config, translating 409 into a typed conflict.
 *
 * `postJson` collapses every non-2xx into `Error(body.error)`, which loses the
 * `updated_at` the conflict response carries — hence the local fetch.
 */
async function postConfig(
  path: string,
  body: Record<string, unknown>,
): Promise<SimulationSaveResult> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      updated_at?: string | null;
    };
    if (res.status === 409 && data.error === 'conflict') {
      throw new SimulationConflictError(data.updated_at ?? null);
    }
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  const data = (await res.json()) as {
    config?: Record<string, unknown>;
    updated_at?: string | null;
  };
  return { config: data.config ?? {}, updated_at: data.updated_at ?? null };
}

/**
 * Re-apply the config as it stood after the given audit entry. The current
 * config is written to history first (server-side), so a restore is itself
 * undoable.
 *
 * Pass `baseUpdatedAt` (the `updated_at` the screen loaded) to get a 409
 * instead of silently overwriting a newer save.
 */
export function restoreSimulationVersion(
  auditId: string,
  baseUpdatedAt?: string | null,
): Promise<SimulationSaveResult> {
  return postConfig('admin-simulation-config?op=restore', {
    auditId,
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  });
}

/**
 * Save with an optional human label that shows up in the history panel.
 * (`saveSimulationConfig` in queries.ts is the un-labelled equivalent.)
 *
 * `baseUpdatedAt` is the optimistic-concurrency token — omit it only when the
 * admin has explicitly chosen "save anyway" after a conflict.
 */
export function saveSimulationConfigWithNote(
  config: Record<string, unknown>,
  note?: string,
  baseUpdatedAt?: string | null,
): Promise<SimulationSaveResult> {
  const trimmed = note?.trim();
  return postConfig('admin-simulation-config', {
    config,
    ...(trimmed ? { note: trimmed } : {}),
    ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
  });
}

// ─────────────────────────────────────────────────────────────
// Delta summary (pure — unit-tested)
// ─────────────────────────────────────────────────────────────

/**
 * Top-level config keys grouped into the sections the Simulation screen shows
 * as tabs, so a version chip reads "Scoring · Customer prompt" rather than
 * "scoring · customerPromptPrefix · customerPromptSuffix".
 */
const CONFIG_SECTIONS: ReadonlyArray<{ label: string; keys: readonly string[] }> = [
  { label: 'Scoring', keys: ['scoring'] },
  { label: 'Drivers', keys: ['drivers'] },
  { label: 'Pushbacks', keys: ['pushbacks'] },
  { label: 'Customer prompt', keys: ['customerPromptPrefix', 'customerPromptSuffix'] },
  { label: 'Retrieval', keys: ['rag'] },
];

const ABSENT = '\u0000absent';

/**
 * JSON with object keys sorted, so two configs that differ only in key order
 * (Postgres jsonb round-trips do reorder) compare equal.
 */
function canonical(value: unknown): string {
  if (value === undefined) return ABSENT;
  const out = JSON.stringify(value, (_key, val: unknown) => {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const src = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(src).sort()) sorted[k] = src[k];
      return sorted;
    }
    return val;
  });
  return out ?? ABSENT;
}

/** Deep, key-order-insensitive equality for two config objects. */
export function configEquals(a: unknown, b: unknown): boolean {
  return canonical(a ?? {}) === canonical(b ?? {});
}

/**
 * Which parts of the simulation config changed between two snapshots.
 * Returns human-readable section labels (empty array = no detected change).
 * Unrecognised top-level keys are reported under their own name so a config
 * field added later still shows up instead of vanishing from the summary.
 */
export function summarizeConfigDelta(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): string[] {
  const a = before ?? {};
  const b = after ?? {};
  const out: string[] = [];
  const claimed = new Set<string>();

  for (const section of CONFIG_SECTIONS) {
    for (const k of section.keys) claimed.add(k);
    if (section.keys.some((k) => canonical(a[k]) !== canonical(b[k]))) {
      out.push(section.label);
    }
  }

  const extras = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => !claimed.has(k))
    .sort();
  for (const k of extras) {
    if (canonical(a[k]) !== canonical(b[k])) out.push(k);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// Customisation scope (pure — unit-tested)
// ─────────────────────────────────────────────────────────────

/**
 * A saved config only ever contains what DIFFERS from the code defaults, so
 * counting its keys is exactly "how much has been customised".
 */
export interface CustomisationCounts {
  dimensions: number;
  drivers: number;
  pushbacks: number;
  /** Prompt-injection fields carrying text (customer + scorer, prefix + suffix). */
  prompts: number;
  /** Retrieval settings differing from the built-in default. */
  retrieval: number;
}

function countKeys(value: unknown): number {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).length
    : 0;
}

export function countCustomisations(
  config: Record<string, unknown> | null | undefined,
): CustomisationCounts {
  const c = config ?? {};
  const scoring = (c.scoring ?? {}) as Record<string, unknown>;
  const dims = Array.isArray(scoring.dimensions) ? scoring.dimensions.length : 0;
  const prompts = [
    scoring.promptPrefix,
    scoring.promptSuffix,
    c.customerPromptPrefix,
    c.customerPromptSuffix,
  ].filter((v) => typeof v === 'string' && v.trim() !== '').length;
  return {
    dimensions: dims,
    drivers: countKeys(c.drivers),
    pushbacks: countKeys(c.pushbacks),
    prompts,
    retrieval: c.rag === undefined ? 0 : 1,
  };
}

/** True when a config carries no customisation at all (i.e. pure defaults). */
export function isDefaultConfig(
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (!config) return true;
  return Object.keys(config).length === 0;
}

/**
 * The bullets for "Reset all to defaults". Every line names something the
 * reader can point at — the generic "this will reset your settings" is what
 * made the old bare `resetAll()` feel safe to click.
 */
export function resetConsequences(
  config: Record<string, unknown> | null | undefined,
): string[] {
  const n = countCustomisations(config);
  const out: string[] = [];
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  if (n.dimensions > 0) {
    out.push(
      `${plural(n.dimensions, 'scoring dimension', 'scoring dimensions')} lose their custom label, description, weight and band examples.`,
    );
  }
  if (n.drivers > 0) {
    out.push(`${plural(n.drivers, 'driver persona', 'driver personas')} revert to the built-in text.`);
  }
  if (n.pushbacks > 0) {
    out.push(
      `${plural(n.pushbacks, 'pushback category', 'pushback categories')} revert — any category you added here disappears.`,
    );
  }
  if (n.prompts > 0) {
    out.push(`${plural(n.prompts, 'prompt note', 'prompt notes')} (customer + scorer) are cleared.`);
  }
  if (n.retrieval > 0) {
    out.push('Retrieval returns to the built-in default (on, k = 4).');
  }
  if (out.length === 0) {
    out.push('Nothing is customised right now — this changes nothing.');
  }
  out.push('Nothing is written until you press “Save changes”, and every save is undoable from History.');
  return out;
}
