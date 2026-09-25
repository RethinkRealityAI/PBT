/**
 * Scenario Studio — the pure model.
 *
 * Ported from the old Scenario Builder's tests (scenarioBuilderSteps +
 * scenarioBuilderHelpers) and extended for the Studio shell. They guard the
 * things a layout refactor silently breaks: a saved column dropping out of
 * every step, a destructive-dialog field list that lies, the guards against
 * emptying the app, and "tested" / "unsaved" meaning what they say.
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_LABELS,
  GALLERY_FILTERS,
  REQUIRED_ADMIN_FIELDS,
  STUDIO_STEPS,
  aiSignature,
  blankToNull,
  buildDuplicateDraft,
  buildStudioContext,
  buildStudioEntries,
  canPublish,
  difficultyText,
  draftFingerprint,
  draftProblems,
  draftsDiffer,
  emptyAdminDraft,
  entryBase,
  hasOverrideValue,
  localEntryHasChanges,
  matchEnumSuggestion,
  matchesGalleryFilter,
  matchesGalleryQuery,
  missingKnowledgeSlugs,
  newAdminScenarioId,
  nextStep,
  overriddenFieldLabels,
  previousStep,
  readiness,
  relativeTime,
  saveBlockers,
  scenarioSummary,
  sortForGallery,
  stepStatus,
  studioTitle,
  visibleScenarioCount,
  type StudioContext,
  type StudioDraft,
} from '../studioModel';
import { STUDIO_STEP_KEYS } from '../../../../src/shared/ai/scenarioAgent';
import { PERSONAS, PUSHBACK_IDS } from '../../../../src/shared/scenarios/enums';
import { SERVER_MANAGED_COLUMNS } from '../../data/scenarioManifest';
import type { ScenarioOverrideRow, UserScenario } from '../../data/types';

/**
 * Every column of the override row, classified. A `Record` over
 * `keyof ScenarioOverrideRow` is exhaustive at compile time: adding a column
 * to the type without deciding whether the Studio edits it fails `tsc`.
 */
const COLUMN_KIND: Record<keyof ScenarioOverrideRow, 'editable' | 'server' | 'id'> = {
  scenario_id: 'id',
  visible: 'editable',
  sort_order: 'editable',
  title_override: 'editable',
  context_override: 'editable',
  opening_line_override: 'editable',
  difficulty_override: 'editable',
  persona_override: 'editable',
  prompt_prefix: 'editable',
  prompt_suffix: 'editable',
  card_title_override: 'editable',
  card_subtitle_override: 'editable',
  info_modal_title: 'editable',
  info_modal_body: 'editable',
  start_button_label: 'editable',
  card_driver_override: 'editable',
  breed: 'editable',
  life_stage: 'editable',
  pushback_id: 'editable',
  pushback_notes: 'editable',
  suggested_driver: 'editable',
  weight_kg: 'editable',
  species: 'editable',
  focus_area: 'editable',
  knowledge_slugs: 'editable',
  deleted_at: 'server',
  created_by: 'server',
  updated_by: 'server',
  updated_at: 'server',
};

const EDITABLE_COLUMNS = (Object.keys(COLUMN_KIND) as Array<keyof ScenarioOverrideRow>).filter(
  (k) => COLUMN_KIND[k] === 'editable',
);

const ctx = (over: Partial<StudioContext> = {}): StudioContext => ({
  source: 'admin',
  tested: false,
  missingSlugs: [],
  unindexedTitles: [],
  notRoleplayTitles: [],
  ...over,
});

const complete: StudioDraft = {
  scenario_id: 'admin:x',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
};

// ── Steps ────────────────────────────────────────────────────

describe('STUDIO_STEPS', () => {
  it('covers every editable column exactly once', () => {
    const all = STUDIO_STEPS.flatMap((s) => s.fields);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...EDITABLE_COLUMNS].sort());
  });

  it('agrees with the server about which columns are the server’s', () => {
    const server = (Object.keys(COLUMN_KIND) as string[]).filter(
      (k) => COLUMN_KIND[k as keyof ScenarioOverrideRow] === 'server',
    );
    // (`created_at` is server-managed too; the row type just doesn't carry it.)
    for (const col of server) expect(SERVER_MANAGED_COLUMNS as readonly string[]).toContain(col);
  });

  it('has seven uniquely-keyed steps in the shared order', () => {
    expect(STUDIO_STEPS.map((s) => s.key)).toEqual([...STUDIO_STEP_KEYS]);
    for (const s of STUDIO_STEPS) {
      expect(s.label.trim()).not.toBe('');
      expect(s.title.trim()).not.toBe('');
      expect(s.hint.trim()).not.toBe('');
    }
  });

  it('keeps every required field on a step before Test drive', () => {
    const early = STUDIO_STEPS.slice(0, 3).flatMap((s) => s.fields);
    for (const req of REQUIRED_ADMIN_FIELDS) expect(early).toContain(req.key);
  });

  it('gives every editable column a human label', () => {
    for (const col of EDITABLE_COLUMNS) expect(FIELD_LABELS[col]).toBeTruthy();
  });

  it('walks forwards and backwards without falling off the ends', () => {
    expect(previousStep('pet')).toBeNull();
    expect(nextStep('pet')).toBe('pushback');
    expect(nextStep('test')).toBe('publish');
    expect(nextStep('publish')).toBeNull();
    expect(previousStep('publish')).toBe('test');
  });
});

describe('hasOverrideValue', () => {
  it('treats empty-ish values as "no override"', () => {
    expect(hasOverrideValue(null)).toBe(false);
    expect(hasOverrideValue(undefined)).toBe(false);
    expect(hasOverrideValue('')).toBe(false);
    expect(hasOverrideValue('   ')).toBe(false);
    expect(hasOverrideValue([])).toBe(false);
    expect(hasOverrideValue(false)).toBe(false);
    expect(hasOverrideValue(Number.NaN)).toBe(false);
  });

  it('counts real values, including 0 (a legitimate sort order)', () => {
    expect(hasOverrideValue(0)).toBe(true);
    expect(hasOverrideValue('Lab')).toBe(true);
    expect(hasOverrideValue(['bcs-chart'])).toBe(true);
    expect(hasOverrideValue(true)).toBe(true);
  });
});

describe('stepStatus', () => {
  it('asks for breed and life stage on the pet step', () => {
    expect(stepStatus('pet', {}, ctx())).toEqual({
      status: 'todo',
      detail: 'Still needs breed and life stage',
    });
    expect(stepStatus('pet', complete, ctx()).status).toBe('done');
  });

  it('needs the owner’s words for a custom pushback', () => {
    expect(stepStatus('pushback', {}, ctx()).status).toBe('todo');
    expect(stepStatus('pushback', { pushback_id: 'custom' }, ctx()).status).toBe('attention');
    expect(
      stepStatus('pushback', { pushback_id: 'custom', pushback_notes: 'Too many kibbles' }, ctx()).status,
    ).toBe('done');
  });

  it('marks the optional steps optional until they are used', () => {
    expect(stepStatus('knowledge', {}, ctx()).status).toBe('optional');
    expect(stepStatus('knowledge', { focus_area: 'weight' }, ctx()).status).toBe('done');
    expect(stepStatus('brief', {}, ctx()).status).toBe('optional');
    expect(stepStatus('brief', { prompt_suffix: 'Never agree first.' }, ctx()).status).toBe('done');
  });

  it('flags attached documents the AI can’t use', () => {
    const status = stepStatus('knowledge', { knowledge_slugs: ['a'] }, ctx({ missingSlugs: ['a'] }));
    expect(status.status).toBe('attention');
  });

  it('reports the test drive and publishing', () => {
    expect(stepStatus('test', {}, ctx()).status).toBe('todo');
    expect(stepStatus('test', {}, ctx({ tested: true })).status).toBe('done');
    expect(stepStatus('publish', { visible: false }, ctx()).status).toBe('todo');
    expect(stepStatus('publish', { visible: true }, ctx()).status).toBe('done');
  });
});

describe('readiness', () => {
  it('blocks publishing until the four core answers are in', () => {
    const items = readiness({ breed: 'Lab' }, ctx());
    const core = items.find((i) => i.key === 'core')!;
    expect(core.ok).toBe(false);
    expect(core.step).toBe('pet');
    expect(canPublish(items)).toBe(false);
  });

  it('lets an untested scenario publish — testing is recommended, not required', () => {
    const items = readiness(complete, ctx({ tested: false }));
    expect(items.find((i) => i.key === 'tested')!.ok).toBe(false);
    expect(canPublish(items)).toBe(true);
  });

  it('blocks publishing over a field limit and a custom pushback with no words', () => {
    expect(canPublish(readiness({ ...complete, breed: 'x'.repeat(81) }, ctx()))).toBe(false);
    expect(canPublish(readiness({ ...complete, pushback_id: 'custom' }, ctx()))).toBe(false);
  });

  it('only warns about knowledge the AI can’t read', () => {
    const items = readiness(complete, ctx({ unindexedTitles: ['Study A'] }));
    const k = items.find((i) => i.key === 'knowledge')!;
    expect(k.ok).toBe(false);
    expect(k.level).toBe('recommended');
    expect(canPublish(items)).toBe(true);
  });
});

// ── Draft rules (ported) ─────────────────────────────────────

describe('overriddenFieldLabels', () => {
  it('names the overridden fields in human terms, in step order', () => {
    const labels = overriddenFieldLabels({
      breed: 'Beagle',
      opening_line_override: 'Look, he is fine.',
      card_title_override: 'Weight talk',
    });
    expect(labels).toEqual(['Breed', 'Opening line', 'Card title']);
  });

  it('ignores fields that carry no override (null / empty / empty array)', () => {
    expect(
      overriddenFieldLabels({
        breed: null,
        pushback_notes: '   ',
        knowledge_slugs: [],
        context_override: undefined,
      } as StudioDraft),
    ).toEqual([]);
  });

  it('only counts `visible` when it differs from how the scenario ships', () => {
    expect(overriddenFieldLabels({ visible: true }, { baseVisible: true })).toEqual([]);
    expect(overriddenFieldLabels({ visible: false }, { baseVisible: true })).toEqual([
      'Visible in app (currently hidden)',
    ]);
  });
});

describe('draftProblems', () => {
  it('says nothing about a draft within every limit', () => {
    expect(draftProblems(complete)).toEqual([]);
  });

  it('names each broken limit in words, with the number', () => {
    const problems = draftProblems({
      breed: 'x'.repeat(81),
      difficulty_override: 7,
      weight_kg: 0,
      knowledge_slugs: Array.from({ length: 41 }, (_, i) => `s${i}`),
    });
    expect(problems).toHaveLength(4);
    expect(problems[0]).toMatch(/^Breed is 81 characters — the limit is 80\./);
    expect(problems.join(' ')).not.toMatch(/_/); // never a column name
  });
});

describe('missingKnowledgeSlugs', () => {
  it('finds attachments with no live document behind them', () => {
    expect(missingKnowledgeSlugs(['study:a', 'study:gone'], ['study:a', 'study:b'])).toEqual([
      'study:gone',
    ]);
  });

  it('is empty for no attachments at all', () => {
    expect(missingKnowledgeSlugs(null, ['study:a'])).toEqual([]);
    expect(missingKnowledgeSlugs([], ['study:a'])).toEqual([]);
  });

  it('reports every slug when the library is empty', () => {
    expect(missingKnowledgeSlugs(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('buildDuplicateDraft', () => {
  const source: StudioDraft = {
    scenario_id: 'seed:0',
    visible: true,
    sort_order: 3,
    breed: 'Lab',
    card_title_override: 'Weight denial',
    knowledge_slugs: ['study:a'],
  };

  it('copies the scenario body under a new admin id', () => {
    const copy = buildDuplicateDraft(source, 'admin:new-id');
    expect(copy.scenario_id).toBe('admin:new-id');
    expect(copy.breed).toBe('Lab');
    expect(copy.knowledge_slugs).toEqual(['study:a']);
  });

  it('starts hidden and unsorted — publishing is a separate decision', () => {
    const copy = buildDuplicateDraft(source, 'admin:new-id');
    expect(copy.visible).toBe(false);
    expect(copy.sort_order).toBeNull();
  });

  it('marks the title as a copy, falling back to the base scenario title', () => {
    expect(buildDuplicateDraft(source, 'admin:x').card_title_override).toBe('(copy) Weight denial');
    expect(
      buildDuplicateDraft({ ...source, card_title_override: null }, 'admin:x', 'Cost pushback')
        .card_title_override,
    ).toBe('(copy) Cost pushback');
  });

  it('keeps the card title inside the column limit', () => {
    const copy = buildDuplicateDraft({ ...source, card_title_override: 'x'.repeat(200) }, 'admin:x');
    expect((copy.card_title_override ?? '').length).toBeLessThanOrEqual(120);
  });
});

describe('visibleScenarioCount', () => {
  const entries = [
    { id: 'seed:0', source: 'library' as const, override: null },
    { id: 'seed:1', source: 'library' as const, override: { visible: false } },
    { id: 'admin:1', source: 'admin' as const, override: { visible: true } },
    { id: 'user:1', source: 'user' as const, override: { visible: true } },
  ];

  it('counts a library scenario with no override as live — that is how it ships', () => {
    expect(visibleScenarioCount([entries[0]])).toBe(1);
  });

  it('excludes hidden rows and user-built scenarios', () => {
    expect(visibleScenarioCount(entries)).toBe(2);
  });

  it('can exclude the scenario being edited, which is the guard the editor needs', () => {
    expect(visibleScenarioCount(entries, 'admin:1')).toBe(1);
    expect(visibleScenarioCount([entries[1], entries[2], entries[3]], 'admin:1')).toBe(0);
  });
});

describe('matchEnumSuggestion', () => {
  it('accepts an exact value', () => {
    expect(matchEnumSuggestion('brand-switch', PUSHBACK_IDS)).toBe('brand-switch');
  });

  it('accepts a case-only difference', () => {
    expect(matchEnumSuggestion('  Skeptical  ', PERSONAS)).toBe('Skeptical');
  });

  it('extracts the one option a prose suggestion names', () => {
    expect(matchEnumSuggestion('Anxious — worried about getting it wrong', PERSONAS)).toBe('Anxious');
  });

  it('refuses free text rather than writing an invalid enum', () => {
    expect(matchEnumSuggestion('Owner is worried about grain content', PUSHBACK_IDS)).toBeNull();
    expect(matchEnumSuggestion('', PERSONAS)).toBeNull();
  });

  it('matches whole words only, so "the customer said…" is not the `custom` pushback', () => {
    expect(matchEnumSuggestion('The customer said no', PUSHBACK_IDS)).toBeNull();
    expect(matchEnumSuggestion('Use the custom pushback here', PUSHBACK_IDS)).toBe('custom');
  });

  it('refuses an ambiguous suggestion that names two options', () => {
    expect(matchEnumSuggestion('Busy or Devoted, hard to say', PERSONAS)).toBeNull();
  });
});

describe('emptyAdminDraft + blankToNull', () => {
  it('starts hidden, at difficulty 2, with the chosen species', () => {
    const d = emptyAdminDraft('admin:new', 'cat');
    expect(d).toMatchObject({ scenario_id: 'admin:new', visible: false, difficulty_override: 2, species: 'cat' });
    expect(emptyAdminDraft('admin:new').species).toBeNull();
  });

  it('turns blank strings into null and leaves real values alone', () => {
    expect(blankToNull({ breed: '  ', pushback_notes: 'x', sort_order: 0, visible: false })).toEqual({
      breed: null,
      pushback_notes: 'x',
      sort_order: 0,
      visible: false,
    });
  });
});

// ── Change tracking + "tested" ───────────────────────────────

describe('draftFingerprint / draftsDiffer', () => {
  it('ignores key order and treats blank as absent', () => {
    expect(draftFingerprint({ breed: 'Lab', life_stage: 'Adult (3-7)' })).toBe(
      draftFingerprint({ life_stage: 'Adult (3-7)', breed: 'Lab', context_override: '' }),
    );
    expect(draftsDiffer({ knowledge_slugs: [] }, { knowledge_slugs: null })).toBe(false);
    expect(draftsDiffer({ species: null }, {})).toBe(false);
  });

  it('keeps false and 0 as real values', () => {
    expect(draftsDiffer({ visible: false }, {})).toBe(true);
    expect(draftsDiffer({ sort_order: 0 }, { sort_order: null })).toBe(true);
    expect(draftsDiffer({ breed: 'Lab' }, { breed: 'Beagle' })).toBe(true);
  });

  it('reads a local entry’s baseline back to decide "unsaved"', () => {
    expect(localEntryHasChanges({ draft: { breed: 'Lab' }, baseline: JSON.stringify({ breed: 'Lab', notes: null }) })).toBe(false);
    expect(localEntryHasChanges({ draft: { breed: 'Lab' }, baseline: '{}' })).toBe(true);
    expect(localEntryHasChanges({ draft: { breed: 'Lab' }, baseline: 'not json' })).toBe(true);
  });
});

describe('aiSignature', () => {
  it('does not change when only the card (or its visibility) changes', () => {
    const tested = aiSignature(complete);
    expect(
      aiSignature({
        ...complete,
        card_title_override: 'New title',
        card_subtitle_override: 'Sub',
        start_button_label: 'Go',
        card_driver_override: 'Energizer',
        info_modal_title: 'Info',
        info_modal_body: 'Body',
        sort_order: 4,
        visible: true,
      }),
    ).toBe(tested);
  });

  it('changes with anything the AI customer reads', () => {
    const base = aiSignature(complete);
    expect(aiSignature({ ...complete, breed: 'Beagle' })).not.toBe(base);
    expect(aiSignature({ ...complete, prompt_prefix: 'Be curt.' })).not.toBe(base);
    expect(aiSignature({ ...complete, knowledge_slugs: ['study:a'] })).not.toBe(base);
    expect(aiSignature({ ...complete, species: 'cat' })).not.toBe(base);
  });

  it('ignores the id, server columns, blank fields and key order', () => {
    expect(
      aiSignature({ ...complete, scenario_id: 'admin:other', updated_at: '2026-01-01', context_override: ' ' }),
    ).toBe(aiSignature(complete));
  });
});

describe('buildStudioContext', () => {
  const docs = [
    { slug: 'a', title: 'Study A', chunk_count: 4, metadata: { tags: { tools: ['roleplay', 'scoring'] } } },
    { slug: 'b', title: 'Study B', chunk_count: 0, metadata: null },
    { slug: 'c', title: 'Fecal chart', chunk_count: 3, metadata: { tags: { tools: ['fecal-scan'] } } },
  ];

  it('reports nothing while the library is unknown', () => {
    const c = buildStudioContext({ draft: { knowledge_slugs: ['gone'] }, source: 'admin', tested: true, docs: null });
    expect(c).toEqual(ctx({ tested: true }));
  });

  it('finds missing, unindexed and roleplay-unreadable attachments', () => {
    const c = buildStudioContext({
      draft: { knowledge_slugs: ['a', 'b', 'c', 'gone'] },
      source: 'library',
      tested: false,
      docs,
    });
    expect(c.source).toBe('library');
    expect(c.missingSlugs).toEqual(['gone']);
    expect(c.unindexedTitles).toEqual(['Study B']);
    expect(c.notRoleplayTitles).toEqual(['Fecal chart']);
  });
});

describe('saveBlockers', () => {
  it('asks a Studio scenario for its four answers before it can be stored', () => {
    const [first] = saveBlockers({ breed: 'Lab', suggested_driver: 'Analyzer' }, 'admin');
    expect(first.message).toBe(
      'To be saved, this scenario still needs its life stage and pushback. Your work is kept in this browser meanwhile.',
    );
    expect(first.step).toBe('pet');
    expect(saveBlockers({ ...complete, suggested_driver: null }, 'admin')[0].step).toBe('customer');
  });

  it('does not require them of a built-in or trainee scenario', () => {
    expect(saveBlockers({}, 'library')).toEqual([]);
    expect(saveBlockers({}, 'user')).toEqual([]);
  });

  it('points each limit problem at the step that fixes it', () => {
    const steps = saveBlockers(
      {
        ...complete,
        card_title_override: 'x'.repeat(121),
        prompt_prefix: 'x'.repeat(1501),
        weight_kg: 999,
      },
      'admin',
    ).map((b) => b.step);
    expect(steps).toEqual(['publish', 'brief', 'pet']);
  });
});

// ── Gallery ──────────────────────────────────────────────────

function row(over: Partial<ScenarioOverrideRow>): ScenarioOverrideRow {
  return {
    ...(emptyAdminDraft('admin:x') as ScenarioOverrideRow),
    deleted_at: null,
    created_by: null,
    updated_by: null,
    updated_at: '2026-09-20T10:00:00Z',
    ...over,
  };
}

function trainee(over: Partial<UserScenario> = {}): UserScenario {
  return {
    id: 'u1',
    creator_id: 'c1',
    title: 'My tricky client',
    breed: 'Beagle',
    life_stage: 'Senior (7+)',
    difficulty: 3,
    pushback_id: 'cost',
    pushback_notes: null,
    weight_kg: null,
    persona: 'Busy',
    suggested_driver: 'Energizer',
    context: null,
    opening_line: null,
    scenario_summary: null,
    is_public: false,
    plays: 2,
    avg_score: null,
    created_at: '2026-09-01T10:00:00Z',
    ...over,
  };
}

describe('buildStudioEntries', () => {
  it('lists the shipped library as live, untouched built-ins', () => {
    const entries = buildStudioEntries([], []);
    expect(entries.map((e) => e.id)).toEqual(['seed:0', 'seed:1', 'seed:2']);
    expect(entries[0]).toMatchObject({
      source: 'library',
      title: 'Weight / obesity denial',
      status: 'live',
      editedAt: null,
    });
    expect(entries[0].draft.breed).toBe('Lab');
  });

  it('overlays an override row and reads its visibility', () => {
    const [first] = buildStudioEntries(
      [row({ scenario_id: 'seed:0', visible: false, card_title_override: 'Big Lab talk' })],
      [],
    );
    expect(first.title).toBe('Big Lab talk');
    expect(first.status).toBe('hidden');
    expect(first.editedAt).toBe(Date.parse('2026-09-20T10:00:00Z'));
  });

  it('adds Studio scenarios as drafts until published, and trainee ones last', () => {
    const entries = buildStudioEntries(
      [
        row({ scenario_id: 'admin:a', breed: 'Poodle', pushback_id: 'rx-diet' }),
        row({ scenario_id: 'admin:b', visible: true, card_title_override: 'Live one' }),
      ],
      [trainee()],
    );
    const a = entries.find((e) => e.id === 'admin:a')!;
    expect(a).toMatchObject({ source: 'admin', status: 'draft', title: 'Skepticism on Rx diet' });
    expect(entries.find((e) => e.id === 'admin:b')!.status).toBe('live');
    const u = entries.find((e) => e.id === 'user:u1')!;
    expect(u).toMatchObject({ source: 'user', status: 'trainee', title: 'My tricky client' });
    expect(u.draft.breed).toBe('Beagle');
  });

  it('gives a library entry its built-in base, and nothing else one', () => {
    const entries = buildStudioEntries([row({ scenario_id: 'admin:a' })], [trainee()]);
    expect(entryBase(entries[0])).toMatchObject({ breed: 'Lab', pushback_id: 'weight-denial' });
    expect(entryBase(entries.find((e) => e.id === 'admin:a')!)).toBeNull();
    expect(entryBase(entries.find((e) => e.id === 'user:u1')!)).toBeNull();
  });

  it('filters and searches the way the chips and search box read', () => {
    const entries = buildStudioEntries(
      [row({ scenario_id: 'admin:a', breed: 'Persian', species: 'cat' })],
      [trainee()],
    );
    const count = (f: (typeof GALLERY_FILTERS)[number]['key']) =>
      entries.filter((e) => matchesGalleryFilter(e, f)).length;
    expect(count('all')).toBe(5);
    expect(count('live')).toBe(3);
    expect(count('drafts')).toBe(1);
    expect(count('builtin')).toBe(3);
    expect(count('trainee')).toBe(1);
    expect(entries.filter((e) => matchesGalleryQuery(e, 'persian')).map((e) => e.id)).toEqual(['admin:a']);
    expect(entries.filter((e) => matchesGalleryQuery(e, 'CAT')).map((e) => e.id)).toEqual(['admin:a']);
    expect(entries.filter((e) => matchesGalleryQuery(e, 'built by a trainee')).map((e) => e.id)).toEqual([
      'user:u1',
    ]);
  });

  it('sorts recent work first, untouched built-ins next, trainee scenarios last', () => {
    const entries = buildStudioEntries(
      [
        row({ scenario_id: 'admin:old', updated_at: '2026-01-01T00:00:00Z' }),
        row({ scenario_id: 'admin:new', updated_at: '2026-09-24T00:00:00Z' }),
      ],
      [trainee({ created_at: '2026-09-25T00:00:00Z' })],
    );
    expect(sortForGallery(entries).map((e) => e.id)).toEqual([
      'admin:new',
      'admin:old',
      'seed:0',
      'seed:1',
      'seed:2',
      'user:u1',
    ]);
  });
});

describe('titles, summaries, times', () => {
  it('names a scenario by card title, then its given name, then its pushback', () => {
    expect(studioTitle({ card_title_override: ' Card ', pushback_id: 'cost' }, 'Given')).toBe('Card');
    expect(studioTitle({ pushback_id: 'cost' }, 'Given')).toBe('Given');
    expect(studioTitle({ pushback_id: 'cost' })).toBe('Cost / price pushback');
    expect(studioTitle({})).toBe('Untitled scenario');
  });

  it('summarises the pet and driver, species-aware', () => {
    expect(scenarioSummary({ breed: 'Persian', life_stage: 'Puppy (<1)', species: 'cat', suggested_driver: 'Harmonizer' })).toBe(
      'Persian · Kitten (<1) · Harmonizer',
    );
    expect(scenarioSummary({})).toBe('Not filled in yet');
  });

  it('describes difficulty levels', () => {
    expect(difficultyText(3)).toBe('Level 3 · Hostile');
    expect(difficultyText(null)).toBeNull();
    expect(difficultyText(9)).toBeNull();
  });

  it('says how long ago in words', () => {
    const now = Date.parse('2026-09-25T12:00:00Z');
    const ago = (ms: number) => relativeTime(now - ms, now);
    expect(ago(10_000)).toBe('just now');
    expect(ago(60_000)).toBe('a minute ago');
    expect(ago(5 * 60_000)).toBe('5 minutes ago');
    expect(ago(3 * 3_600_000)).toBe('3 hours ago');
    expect(ago(26 * 3_600_000)).toBe('yesterday');
    expect(ago(3 * 86_400_000)).toBe('3 days ago');
    expect(ago(15 * 86_400_000)).toBe('2 weeks ago');
    expect(ago(90 * 86_400_000)).toBe('3 months ago');
    expect(relativeTime(now + 60_000, now)).toBe('just now');
  });

  it('mints admin ids', () => {
    const id = newAdminScenarioId();
    expect(id).toMatch(/^admin:[0-9a-f-]{36}$/);
    expect(newAdminScenarioId()).not.toBe(id);
  });
});
