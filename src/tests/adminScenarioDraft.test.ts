/**
 * Admin Scenario Builder — draft hydration.
 *
 * Guards the bug where opening a never-overridden scenario showed a blank
 * form: the editor must open on the scenario's CURRENT EFFECTIVE VALUES.
 *
 * Lives under src/tests because it spans all three layers of the change:
 * the admin manifest/hydration helpers, the consumer scenario data it
 * mirrors (src/data/scenarios.ts), and the Netlify function's validation.
 */
import { describe, expect, it } from 'vitest';
import {
  LIBRARY_MANIFEST,
  buildBaseLayer,
  buildInitialDraft,
  diffAgainstBase,
  stripServerManaged,
} from '../../admin/src/data/scenarioManifest';
import type { ScenarioOverrideRow, UserScenario } from '../../admin/src/data/types';
import {
  LIBRARY_SCENARIOS,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
  LIFE_STAGES as CONSUMER_LIFE_STAGES,
} from '../data/scenarios';
import {
  LIFE_STAGES,
  PERSONAS,
  PUSHBACK_IDS,
  isLifeStage,
  isPersona,
  isPushbackId,
} from '../shared/scenarios/enums';
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

describe('diffAgainstBase', () => {
  const entry = { id: 'seed:0', source: 'library' as const, override: null };

  it('nulls out fields still equal to the base so saving never pins a copy', () => {
    const draft = buildInitialDraft(entry, seed, null);
    const sparse = diffAgainstBase(draft, entry, seed, null);
    expect(sparse.breed).toBeNull();
    expect(sparse.context_override).toBeNull();
    expect(sparse.opening_line_override).toBeNull();
    expect(sparse.difficulty_override).toBeNull();
    // Identity + visibility always ride along.
    expect(sparse.scenario_id).toBe('seed:0');
    expect(sparse.visible).toBe(true);
  });

  it('keeps only the fields the admin actually changed', () => {
    const draft = buildInitialDraft(entry, seed, null);
    draft.breed = 'Malinois';
    draft.prompt_prefix = 'Be extra impatient.';
    const sparse = diffAgainstBase(draft, entry, seed, null);
    expect(sparse.breed).toBe('Malinois');
    expect(sparse.prompt_prefix).toBe('Be extra impatient.');
    expect(sparse.persona_override).toBeNull();
  });

  it('treats a cleared string as inherit, and trims before comparing', () => {
    const draft = buildInitialDraft(entry, seed, null);
    draft.context_override = '';
    draft.breed = ` ${seed.breed} `;
    const sparse = diffAgainstBase(draft, entry, seed, null);
    expect(sparse.context_override).toBeNull();
    expect(sparse.breed).toBeNull();
  });

  it('passes admin-authored drafts through unchanged (no base to diff)', () => {
    const adminEntry = { id: 'admin:abc', source: 'admin' as const, override: null };
    const draft: Partial<ScenarioOverrideRow> = {
      scenario_id: 'admin:abc',
      visible: false,
      breed: 'Corgi',
      focus_area: 'gi',
    };
    expect(diffAgainstBase(draft, adminEntry, null, null)).toEqual(draft);
  });

  it('keeps knowledge links (arrays have no base value)', () => {
    const draft = buildInitialDraft(entry, seed, null);
    draft.knowledge_slugs = ['clinical:reference'];
    draft.focus_area = 'weight';
    const sparse = diffAgainstBase(draft, entry, seed, null);
    expect(sparse.knowledge_slugs).toEqual(['clinical:reference']);
    expect(sparse.focus_area).toBe('weight');
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
      // Retrieval targeting is part of the shipped scenario too — a seed that
      // links knowledge documents must open the editor with those links, not
      // an empty field the admin then "changes" by saving.
      expect(m.focusArea).toBe(s.focusArea ?? null);
      expect(m.knowledgeSlugs).toEqual(s.knowledgeSlugs ?? null);
    });
  });

  it('hydrates the base layer with the manifest focus / knowledge links', () => {
    const draft = buildBaseLayer(
      { id: 'seed:0', source: 'library', override: null },
      seed,
      null,
    );
    expect(draft.focus_area).toBe(seed.focusArea);
    expect(draft.knowledge_slugs).toEqual(seed.knowledgeSlugs);
  });
});

/**
 * `src/shared/scenarios/enums.ts` is imported by BOTH admin/src (the builder's
 * pickers) and netlify/functions (server-side validation), and deliberately
 * does NOT import the consumer data module — the admin bundle is a separate
 * Vite entry. That makes it a hand-maintained mirror, exactly like
 * LIBRARY_MANIFEST above, so it needs the same guard: a value the server
 * accepts but `src/data/scenarios.ts` doesn't know is a scenario that saves
 * cleanly and then degrades the roleplay silently.
 */
describe('shared scenario enums mirror the consumer source of truth', () => {
  it('PUSHBACK_IDS matches PUSHBACK_CATEGORIES ids, in order', () => {
    expect(PUSHBACK_IDS).toEqual(PUSHBACK_CATEGORIES.map((c) => c.id));
  });

  it('LIFE_STAGES matches the LifeStage union values, in order', () => {
    expect(LIFE_STAGES).toEqual([...CONSUMER_LIFE_STAGES]);
  });

  it('PERSONAS matches the OwnerPersona values, in order', () => {
    expect(PERSONAS).toEqual([...OWNER_PERSONAS]);
  });

  it('the type guards accept every consumer value and reject unknowns', () => {
    for (const id of PUSHBACK_CATEGORIES.map((c) => c.id)) {
      expect(isPushbackId(id)).toBe(true);
    }
    for (const stage of CONSUMER_LIFE_STAGES) expect(isLifeStage(stage)).toBe(true);
    for (const persona of OWNER_PERSONAS) expect(isPersona(persona)).toBe(true);

    expect(isPushbackId('no-such-pushback')).toBe(false);
    expect(isLifeStage('Geriatric (99+)')).toBe(false);
    // The deleted 6-type Echo vocabulary must not sneak back in as a persona.
    expect(isPersona('Imaginer')).toBe(false);
    expect(isPushbackId(null)).toBe(false);
    expect(isLifeStage(42)).toBe(false);
    expect(isPersona(undefined)).toBe(false);
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

  it('accepts known scenario enums and rejects unknown ones', () => {
    expect(validateOverride({ ...base, pushback_id: 'rx-diet' })).toBeNull();
    expect(validateOverride({ ...base, pushback_id: null })).toBeNull();
    expect(validateOverride({ ...base, pushback_id: 'made-up' })).toBe(
      'pushback_id must be a known pushback category',
    );
    expect(validateOverride({ ...base, life_stage: 'Senior (7+)' })).toBeNull();
    expect(validateOverride({ ...base, life_stage: 'Ancient' })).toBe(
      'life_stage must be a known life stage',
    );
    expect(validateOverride({ ...base, persona_override: 'Bargain-hunter' })).toBeNull();
    expect(validateOverride({ ...base, persona_override: 'Grumpy' })).toBe(
      'persona_override must be a known persona',
    );
  });

  it('bounds weight_kg and breed length', () => {
    expect(validateOverride({ ...base, weight_kg: 12.5 })).toBeNull();
    expect(validateOverride({ ...base, weight_kg: null })).toBeNull();
    expect(validateOverride({ ...base, weight_kg: 0 })).toBe(
      'weight_kg must be between 0 and 200',
    );
    expect(validateOverride({ ...base, weight_kg: -3 })).toBe(
      'weight_kg must be between 0 and 200',
    );
    expect(validateOverride({ ...base, weight_kg: 201 })).toBe(
      'weight_kg must be between 0 and 200',
    );
    expect(
      validateOverride({ ...base, weight_kg: '12' as unknown as number }),
    ).toBe('weight_kg must be a number');
    expect(validateOverride({ ...base, breed: 'Lab' })).toBeNull();
    expect(validateOverride({ ...base, breed: 'x'.repeat(81) })).toBe(
      'breed too long (max 80)',
    );
  });

  it('requires the scenario-defining fields on admin ids, unless duplicating', () => {
    const admin: OverrideUpsert = { scenario_id: 'admin:abc' };
    expect(validateOverride(admin)).toBe('admin scenarios require breed');
    // A duplicate lands hidden and is completed in the editor, so the
    // completeness rule is waived — but the value rules are not.
    expect(validateOverride(admin, { requireAdminFields: false })).toBeNull();
    expect(
      validateOverride(
        { ...admin, pushback_id: 'nope' },
        { requireAdminFields: false },
      ),
    ).toBe('pushback_id must be a known pushback category');
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
