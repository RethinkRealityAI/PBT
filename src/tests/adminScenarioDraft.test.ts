/**
 * Admin Scenario Builder — draft hydration.
 *
 * Guards the bug where opening a never-overridden scenario showed a blank
 * form: the editor must open on the scenario's CURRENT EFFECTIVE VALUES.
 *
 * Lives under src/tests (not admin/) because vitest's `include` is
 * `src/**` — the admin app is a second Vite entry of this same project and
 * has no runner of its own.
 */
import {
  LIBRARY_MANIFEST,
  buildInitialDraft,
  stripServerManaged,
} from '../../admin/src/data/scenarioManifest';
import type { ScenarioOverrideRow, UserScenario } from '../../admin/src/data/types';
import { LIBRARY_SCENARIOS } from '../data/scenarios';
import {
  pickWritable,
  validateOverride,
  type OverrideUpsert,
} from '../../netlify/functions/admin-scenario-overrides';

const seed = LIBRARY_MANIFEST[0];

function overrideRow(patch: Partial<ScenarioOverrideRow>): ScenarioOverrideRow {
  return {
    scenario_id: 'seed:0',
    visible: true,
    sort_order: null,
    title_override: null,
    context_override: null,
    opening_line_override: null,
    difficulty_override: null,
    persona_override: null,
    prompt_prefix: null,
    prompt_suffix: null,
    card_title_override: null,
    card_subtitle_override: null,
    info_modal_title: null,
    info_modal_body: null,
    start_button_label: null,
    card_driver_override: null,
    breed: null,
    life_stage: null,
    pushback_id: null,
    pushback_notes: null,
    suggested_driver: null,
    weight_kg: null,
    focus_area: null,
    knowledge_slugs: null,
    deleted_at: null,
    created_by: null,
    updated_by: null,
    updated_at: '2026-08-14T00:00:00.000Z',
    ...patch,
  };
}

const userScenario: UserScenario = {
  id: 'abc',
  creator_id: 'u1',
  title: 'Frenchie itch',
  breed: 'French Bulldog',
  life_stage: 'Junior (1-3)',
  difficulty: 4,
  pushback_id: 'rx-diet',
  pushback_notes: 'Thinks the derm diet is an upsell.',
  weight_kg: 12.5,
  persona: 'Anxious',
  suggested_driver: 'Analyzer',
  context: 'Recurrent otitis, owner burnt out.',
  opening_line: 'Is this really necessary?',
  scenario_summary: null,
  is_public: false,
  plays: 3,
  avg_score: 61,
  created_at: '2026-08-01T00:00:00.000Z',
};

describe('buildInitialDraft', () => {
  it('hydrates a never-overridden library scenario from the manifest', () => {
    const draft = buildInitialDraft(
      { id: 'seed:0', source: 'library', override: null },
      seed,
      null,
    );
    expect(draft.scenario_id).toBe('seed:0');
    expect(draft.breed).toBe(seed.breed);
    expect(draft.life_stage).toBe(seed.lifeStage);
    expect(draft.pushback_id).toBe(seed.pushback);
    expect(draft.suggested_driver).toBe(seed.driver);
    expect(draft.persona_override).toBe(seed.persona);
    expect(draft.difficulty_override).toBe(seed.defaultDifficulty);
    expect(draft.context_override).toBe(seed.context);
    expect(draft.opening_line_override).toBe(seed.openingLine);
    // The landmine: a library scenario is live today, so the editor must not
    // open pre-set to hidden.
    expect(draft.visible).toBe(true);
  });

  it('lets a set override column win over the base, and keeps the base for null columns', () => {
    const draft = buildInitialDraft(
      {
        id: 'seed:0',
        source: 'library',
        override: overrideRow({
          breed: 'Golden',
          difficulty_override: 1,
          prompt_prefix: 'Be impatient.',
          focus_area: 'weight',
          knowledge_slugs: ['obesity-consensus'],
        }),
      },
      seed,
      null,
    );
    expect(draft.breed).toBe('Golden');
    expect(draft.difficulty_override).toBe(1);
    expect(draft.prompt_prefix).toBe('Be impatient.');
    expect(draft.focus_area).toBe('weight');
    expect(draft.knowledge_slugs).toEqual(['obesity-consensus']);
    // Untouched columns fall back to the seed.
    expect(draft.life_stage).toBe(seed.lifeStage);
    expect(draft.opening_line_override).toBe(seed.openingLine);
  });

  it('honours an override row that hides the scenario', () => {
    const draft = buildInitialDraft(
      { id: 'seed:0', source: 'library', override: overrideRow({ visible: false }) },
      seed,
      null,
    );
    expect(draft.visible).toBe(false);
  });

  it('never carries server-managed columns into the draft', () => {
    const draft = buildInitialDraft(
      {
        id: 'seed:0',
        source: 'library',
        override: overrideRow({ created_by: 'admin-1', updated_by: 'admin-1' }),
      },
      seed,
      null,
    );
    expect(draft).not.toHaveProperty('updated_at');
    expect(draft).not.toHaveProperty('created_by');
    expect(draft).not.toHaveProperty('updated_by');
    expect(draft).not.toHaveProperty('deleted_at');
  });

  it('maps a user-built scenario onto the override-shaped fields', () => {
    const draft = buildInitialDraft(
      { id: 'user:abc', source: 'user', override: null },
      null,
      userScenario,
    );
    expect(draft.scenario_id).toBe('user:abc');
    expect(draft.breed).toBe('French Bulldog');
    expect(draft.life_stage).toBe('Junior (1-3)');
    expect(draft.pushback_id).toBe('rx-diet');
    expect(draft.pushback_notes).toBe('Thinks the derm diet is an upsell.');
    expect(draft.suggested_driver).toBe('Analyzer');
    expect(draft.persona_override).toBe('Anxious');
    expect(draft.difficulty_override).toBe(4);
    expect(draft.weight_kg).toBe(12.5);
    expect(draft.context_override).toBe('Recurrent otitis, owner burnt out.');
    expect(draft.opening_line_override).toBe('Is this really necessary?');
    expect(draft.visible).toBe(true);
  });

  it('starts a brand-new admin scenario hidden and empty', () => {
    const draft = buildInitialDraft(
      { id: 'admin:new', source: 'admin', override: null },
      null,
      null,
    );
    expect(draft.visible).toBe(false);
    expect(draft.breed).toBeUndefined();
  });

  it('uses the override row as the whole scenario for admin-authored ids', () => {
    const draft = buildInitialDraft(
      {
        id: 'admin:xyz',
        source: 'admin',
        override: overrideRow({
          scenario_id: 'admin:xyz',
          visible: true,
          breed: 'GSD',
          card_title_override: 'Breeder said raw',
        }),
      },
      null,
      null,
    );
    expect(draft.breed).toBe('GSD');
    expect(draft.card_title_override).toBe('Breeder said raw');
    expect(draft.visible).toBe(true);
  });
});

describe('stripServerManaged', () => {
  it('drops server-owned columns before the POST', () => {
    const out = stripServerManaged({
      scenario_id: 'seed:0',
      breed: 'Lab',
      updated_at: '2026-08-14T00:00:00.000Z',
      created_by: 'x',
      updated_by: 'x',
      deleted_at: null,
    } as Partial<ScenarioOverrideRow>);
    expect(out).toEqual({ scenario_id: 'seed:0', breed: 'Lab' });
  });
});

describe('LIBRARY_MANIFEST', () => {
  // The manifest is a hand-maintained mirror of src/data/scenarios.ts (the
  // admin app is a separate entry and does not import consumer data modules).
  // This is the guard that keeps the mirror honest.
  it('matches LIBRARY_SCENARIOS entry for entry', () => {
    expect(LIBRARY_MANIFEST).toHaveLength(LIBRARY_SCENARIOS.length);
    LIBRARY_SCENARIOS.forEach((s, i) => {
      const m = LIBRARY_MANIFEST[i];
      expect(m.id).toBe(`seed:${i}`);
      expect(m.title).toBe(s.pushback.title);
      expect(m.breed).toBe(s.breed);
      expect(m.pushback).toBe(s.pushback.id);
      expect(m.driver).toBe(s.suggestedDriver);
      expect(m.defaultDifficulty).toBe(s.difficulty);
      expect(m.lifeStage).toBe(s.age);
      expect(m.persona).toBe(s.persona);
      expect(m.pushbackNotes).toBe(s.pushbackNotes ?? null);
      expect(m.context).toBe(s.context ?? null);
      expect(m.openingLine).toBe(s.openingLine ?? null);
      expect(m.weightKg).toBe(s.weightKg == null ? null : Number(s.weightKg));
    });
  });
});

describe('admin-scenario-overrides validation', () => {
  const base: OverrideUpsert = { scenario_id: 'seed:0' };

  it('accepts a known focus area and rejects an unknown one', () => {
    expect(validateOverride({ ...base, focus_area: 'gi' })).toBeNull();
    expect(validateOverride({ ...base, focus_area: null })).toBeNull();
    expect(validateOverride({ ...base, focus_area: 'nonsense' })).toBe(
      'focus_area must be a known focus area key',
    );
  });

  it('validates knowledge_slugs shape, count, and entry length', () => {
    expect(validateOverride({ ...base, knowledge_slugs: ['a', 'b'] })).toBeNull();
    expect(validateOverride({ ...base, knowledge_slugs: null })).toBeNull();
    expect(
      validateOverride({
        ...base,
        knowledge_slugs: 'not-an-array' as unknown as string[],
      }),
    ).toBe('knowledge_slugs must be an array');
    expect(
      validateOverride({
        ...base,
        knowledge_slugs: Array.from({ length: 41 }, (_, i) => `doc-${i}`),
      }),
    ).toBe('knowledge_slugs too long (max 40)');
    expect(
      validateOverride({ ...base, knowledge_slugs: ['x'.repeat(201)] }),
    ).toMatch(/knowledge_slugs entries/);
    expect(
      validateOverride({ ...base, knowledge_slugs: [42 as unknown as string] }),
    ).toMatch(/knowledge_slugs entries/);
  });

  it('keeps only writable columns out of the request body', () => {
    const out = pickWritable({
      scenario_id: 'seed:0',
      breed: 'Lab',
      focus_area: 'weight',
      knowledge_slugs: ['a'],
      // Server-owned / unknown fields must not survive.
      created_by: 'attacker',
      updated_by: 'attacker',
      deleted_at: '2026-01-01',
      updated_at: '2026-01-01',
      bogus: true,
    } as unknown as OverrideUpsert);
    expect(out).toEqual({
      scenario_id: 'seed:0',
      breed: 'Lab',
      focus_area: 'weight',
      knowledge_slugs: ['a'],
    });
  });

  it('does not add keys the client omitted', () => {
    expect(pickWritable({ scenario_id: 'admin:1' })).toEqual({ scenario_id: 'admin:1' });
  });
});
