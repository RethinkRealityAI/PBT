/**
 * Static manifest of LIBRARY_SCENARIOS the consumer ships with — used by the
 * Scenario Builder to list selectable scenarios AND to pre-fill the editor
 * with the scenario's real current values when no override row exists yet.
 *
 * ⚠️ HAND-MAINTAINED MIRROR — this file must track `src/data/scenarios.ts`
 * (`LIBRARY_SCENARIOS`, which is a curated subset of `SEED_SCENARIOS`). The
 * admin app is a separate Vite entry and deliberately does not import consumer
 * data modules, so any edit to those scenarios (breed, life stage, persona,
 * difficulty, context, opening line, weight, focus area, knowledge links) must
 * be copied here or the builder will show stale values as the "current"
 * scenario. `src/tests/adminScenarioDraft.test.ts` asserts the mirror
 * field-for-field against LIBRARY_SCENARIOS.
 *
 * Stable id format matches seedScenarioId(i) in src/data/scenarioOverrides.ts.
 */

import type { DriverKey } from '../lib/tokens';
import type { ScenarioOverrideRow, UserScenario } from './types';

export interface SeedScenarioManifest {
  id: string;
  /** Display title (mirrors the pushback category title). */
  title: string;
  breed: string;
  /** Pushback category id. */
  pushback: string;
  driver: DriverKey;
  defaultDifficulty: number;
  // ── Full scenario body (mirrors src/data/scenarios.ts) ──
  /** `Scenario.age` in the consumer app. */
  lifeStage: string;
  persona: string;
  pushbackNotes: string | null;
  context: string | null;
  openingLine: string | null;
  weightKg: number | null;
  /** Clinical focus area used for retrieval targeting (`Scenario.focusArea`). */
  focusArea: string | null;
  /** Explicitly attached knowledge docs (`Scenario.knowledgeSlugs`). */
  knowledgeSlugs: string[] | null;
}

export const LIBRARY_MANIFEST: SeedScenarioManifest[] = [
  {
    id: 'seed:0',
    title: 'Weight / obesity denial',
    breed: 'Lab',
    pushback: 'weight-denial',
    driver: 'Activator',
    defaultDifficulty: 3,
    lifeStage: 'Adult (3-7)',
    persona: 'Skeptical',
    pushbackNotes: null,
    context:
      "Buddy is a 5-year-old male Lab weighing 42 kg — BCS 8/9. Vet flagged obesity and joint stress risk, recommended Satiety Support and a 12-week weight plan. Owner insists Buddy is just 'a big Lab' and that all his friends' Labs look the same. He eats whatever is on special at the supermarket and gets generous treats.",
    openingLine:
      "Look, Buddy's not fat — he's just a big Lab. All my friends' Labs look exactly the same.",
    weightKg: null,
    focusArea: null,
    knowledgeSlugs: null,
  },
  {
    id: 'seed:1',
    title: 'Cost / price pushback',
    breed: 'Lab',
    pushback: 'cost',
    driver: 'Activator',
    defaultDifficulty: 2,
    lifeStage: 'Adult (3-7)',
    persona: 'Skeptical',
    pushbackNotes: null,
    context:
      "Owner came in for a routine weight check. Vet recommended Satiety Support but owner balked at the price difference vs. the store brand she's been using for two years.",
    openingLine:
      'I appreciate you seeing us, but honestly Royal Canin is just way too expensive. I can get similar food for half the price at the supermarket.',
    weightKg: null,
    focusArea: null,
    knowledgeSlugs: null,
  },
  {
    id: 'seed:2',
    title: 'Switching brands hesitation',
    breed: 'Mini Schnauzer',
    pushback: 'brand-switch',
    driver: 'Activator',
    defaultDifficulty: 2,
    lifeStage: 'Junior (1-3)',
    persona: 'Bargain-hunter',
    pushbackNotes: null,
    context:
      'Dog is eating a supermarket brand with no apparent issues. Owner sees no reason to change and wants to know the ROI on the premium price point.',
    openingLine:
      "We've been using our current brand for over a year and she's perfectly healthy. I don't see why we'd need to change anything.",
    weightKg: null,
    focusArea: null,
    knowledgeSlugs: null,
  },
];

// ─────────────────────────────────────────────────────────────
// Draft hydration
// ─────────────────────────────────────────────────────────────

/**
 * Columns the server owns. They ride along on the fetched override row but
 * must never be part of the editable draft (nor be POSTed back).
 */
export const SERVER_MANAGED_COLUMNS = [
  'updated_at',
  'created_at',
  'created_by',
  'updated_by',
  'deleted_at',
] as const;

export interface ScenarioDraftEntry {
  id: string;
  source: 'library' | 'admin' | 'user';
  override: ScenarioOverrideRow | null;
}

/**
 * Build the editor's initial draft = the scenario's CURRENT EFFECTIVE VALUES.
 *
 * Base layer:
 *   • `library` → the seed manifest above (what the consumer ships)
 *   • `user`    → the `user_scenarios` row, mapped onto override-shaped keys
 *   • `admin`   → nothing; the override row IS the scenario
 * Override layer: every non-null column of the override row wins over the base
 * (a null column means "inherit the base", which is exactly the runtime rule).
 *
 * `visible` is special: an existing row's value is authoritative, otherwise
 * library/user scenarios hydrate to `true` because they are live in the app
 * today — defaulting to `false` silently hid them on first save.
 */
export function buildInitialDraft(
  entry: ScenarioDraftEntry,
  manifest: SeedScenarioManifest | null,
  userScenario: UserScenario | null,
): Partial<ScenarioOverrideRow> {
  const draft = buildBaseLayer(entry, manifest, userScenario);

  const row = entry.override;
  if (!row) return draft;

  const server = new Set<string>(SERVER_MANAGED_COLUMNS);
  for (const [key, value] of Object.entries(row)) {
    if (server.has(key)) continue;
    // null = "no override for this field" → keep the base value.
    if (value === null || value === undefined) continue;
    (draft as Record<string, unknown>)[key] = value;
  }
  draft.scenario_id = entry.id;
  draft.visible = row.visible;
  return draft;
}

/** The base layer only: what the scenario looks like with NO override row. */
export function buildBaseLayer(
  entry: ScenarioDraftEntry,
  manifest: SeedScenarioManifest | null,
  userScenario: UserScenario | null,
): Partial<ScenarioOverrideRow> {
  const draft: Partial<ScenarioOverrideRow> = {
    scenario_id: entry.id,
    // Seed + user scenarios are live in the consumer app right now; only a
    // brand-new admin-authored scenario starts hidden.
    visible: entry.source !== 'admin',
  };

  if (entry.source === 'library' && manifest) {
    draft.breed = manifest.breed;
    draft.life_stage = manifest.lifeStage;
    draft.pushback_id = manifest.pushback;
    draft.pushback_notes = manifest.pushbackNotes;
    draft.suggested_driver = manifest.driver;
    draft.persona_override = manifest.persona;
    draft.difficulty_override = manifest.defaultDifficulty;
    draft.weight_kg = manifest.weightKg;
    draft.context_override = manifest.context;
    draft.opening_line_override = manifest.openingLine;
    // Retrieval targeting is part of the shipped scenario too — omitting it
    // made the editor open on a blank knowledge attachment for a seed that
    // already had one, and diffAgainstBase then saved it as a "change".
    draft.focus_area = manifest.focusArea;
    draft.knowledge_slugs = manifest.knowledgeSlugs;
  } else if (entry.source === 'user' && userScenario) {
    draft.breed = userScenario.breed;
    draft.life_stage = userScenario.life_stage;
    draft.pushback_id = userScenario.pushback_id;
    draft.pushback_notes = userScenario.pushback_notes;
    draft.suggested_driver = (userScenario.suggested_driver as DriverKey | null) ?? null;
    draft.persona_override = userScenario.persona;
    draft.difficulty_override = userScenario.difficulty;
    draft.weight_kg = userScenario.weight_kg;
    draft.context_override = userScenario.context;
    draft.opening_line_override = userScenario.opening_line;
  }

  return draft;
}

/**
 * Turn an edited draft back into a SPARSE override before saving: any field
 * whose value still equals the base layer is sent as null ("inherit"), so
 * opening the editor and saving does not freeze a copy of the base scenario —
 * later updates to the seed copy in src/data/scenarios.ts (or to the user's
 * own scenario) keep flowing through. Admin-authored scenarios have no base,
 * so their draft passes through unchanged.
 */
export function diffAgainstBase(
  draft: Partial<ScenarioOverrideRow>,
  entry: ScenarioDraftEntry,
  manifest: SeedScenarioManifest | null,
  userScenario: UserScenario | null,
): Partial<ScenarioOverrideRow> {
  if (entry.source === 'admin') return { ...draft };
  const base = buildBaseLayer(entry, manifest, userScenario) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...draft };
  for (const [key, value] of Object.entries(out)) {
    if (key === 'scenario_id' || key === 'visible') continue;
    const norm = typeof value === 'string' ? value.trim() || null : value;
    const baseVal = base[key];
    const baseNorm = typeof baseVal === 'string' ? baseVal.trim() || null : (baseVal ?? null);
    out[key] = norm !== null && norm !== baseNorm ? norm : null;
  }
  return out as Partial<ScenarioOverrideRow>;
}

/** Drop server-managed columns before POSTing a draft. */
export function stripServerManaged(
  draft: Partial<ScenarioOverrideRow>,
): Partial<ScenarioOverrideRow> {
  const out: Record<string, unknown> = { ...draft };
  for (const key of SERVER_MANAGED_COLUMNS) delete out[key];
  return out as Partial<ScenarioOverrideRow>;
}
