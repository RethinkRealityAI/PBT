/**
 * Readiness warnings — where the AI will quietly be generic: a team objection
 * with no hidden concerns, and inherited category documents session scoring
 * can't read for this animal. They advise and never block publishing, and
 * they say nothing while the facts aren't known (library not loaded,
 * objection list not loaded).
 */
import { describe, expect, it } from 'vitest';
import {
  categoryScoringReach,
  hiddenConcernCount,
  lacksHiddenConcerns,
  objectionConcernsFor,
  readinessWarnings,
} from '../readinessWarnings';
import { buildStudioContext, canPublish, readiness, type StudioDraft } from '../studioModel';
import { rowToTeamObjection, type TeamObjection } from '../../../../src/shared/scenarios/objections';
import { BUILT_IN_CATEGORIES, type ObjectionCategory } from '../../../../src/shared/scenarios/objectionCategories';

/** Built through the tolerant reader, so the fixture tracks the real shape. */
function teamObjection(over: Record<string, unknown>): TeamObjection {
  const o = rowToTeamObjection({
    id: 'team:probiotics-not-needed',
    title: 'Probiotics: not needed',
    example: '“Why would he need them?”',
    species: ['dog', 'cat'],
    categoryId: 'category:probiotics',
    coaching: {},
    visible: true,
    ...over,
  });
  if (!o) throw new Error('bad fixture');
  return o;
}

const GENERIC = teamObjection({});
const COACHED = teamObjection({
  id: 'team:probiotics-coached',
  title: 'Probiotics: coached',
  coaching: { rootConcerns: ['Worried it is a money grab'], clarifyQuestions: ['What have you heard?'] },
});
const RETIRED_GENERIC = teamObjection({ id: 'team:old', title: 'Old objection', visible: false });

const PROBIOTICS: ObjectionCategory = {
  id: 'category:probiotics',
  name: 'Probiotics',
  nameFr: null,
  description: '',
  focusArea: 'gi',
  knowledgeSlugs: ['study:dog-scoring', 'study:cat-roleplay'],
  sortOrder: 40,
  builtIn: false,
  updatedAt: null,
};
const CATEGORIES = [...BUILT_IN_CATEGORIES, PROBIOTICS];

const doc = (slug: string, tags: Record<string, unknown> | null, title = slug) => ({
  slug,
  title,
  chunk_count: 3,
  metadata: tags ? { tags } : null,
});
const DOCS = [
  doc('study:dog-scoring', { tools: ['roleplay', 'scoring'], species: ['dog'] }),
  doc('study:cat-roleplay', { tools: ['roleplay'], species: ['cat'] }),
];

const complete = (over: StudioDraft = {}): StudioDraft => ({
  scenario_id: 'admin:x',
  species: 'dog',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: GENERIC.id,
  suggested_driver: 'Analyzer',
  ...over,
});

function context(draft: StudioDraft, docs: typeof DOCS | null = DOCS, loaded = true) {
  return buildStudioContext({
    draft,
    source: 'admin',
    tested: true,
    docs,
    objections: { team: [GENERIC, COACHED, RETIRED_GENERIC], loaded },
    categories: CATEGORIES,
  });
}

// ── 1 · Hidden concerns ─────────────────────────────────────────

describe('hidden concerns', () => {
  it('only a TEAM objection can lack them — built-ins carry the taxonomy', () => {
    expect(lacksHiddenConcerns(GENERIC)).toBe(true);
    expect(lacksHiddenConcerns(COACHED)).toBe(false);
    expect(lacksHiddenConcerns({ id: 'cost', coaching: {} })).toBe(false);
    expect(lacksHiddenConcerns({ id: 'custom', coaching: {} })).toBe(false);
    // Blank lines are not concerns.
    expect(hiddenConcernCount({ coaching: { rootConcerns: ['  ', ''] } })).toBe(0);
    expect(lacksHiddenConcerns({ id: 'team:x-y', coaching: { rootConcerns: ['  '] } })).toBe(true);
  });

  it('objectionConcernsFor: the draft’s team objection, counted — nothing to say otherwise', () => {
    const team = [GENERIC, COACHED, RETIRED_GENERIC];
    expect(objectionConcernsFor(GENERIC.id, team)).toEqual({ title: 'Probiotics: not needed', count: 0 });
    expect(objectionConcernsFor(COACHED.id, team)).toEqual({ title: 'Probiotics: coached', count: 1 });
    // A retired one still plays, so it still counts.
    expect(objectionConcernsFor(RETIRED_GENERIC.id, team)).toEqual({ title: 'Old objection', count: 0 });
    expect(objectionConcernsFor('cost', team)).toBeNull();
    expect(objectionConcernsFor('custom', team)).toBeNull();
    expect(objectionConcernsFor(null, team)).toBeNull();
    expect(objectionConcernsFor('team:not-loaded', team)).toBeNull();
  });

  it('warns in the checklist without blocking publishing', () => {
    const draft = complete();
    const items = readiness(draft, context(draft));
    const item = items.find((i) => i.key === 'objection-concerns')!;
    expect(item).toMatchObject({
      ok: false,
      level: 'recommended',
      step: 'pushback',
      label: 'The objection says what the owner is really worried about',
    });
    expect(item.detail).toBe(
      '“Probiotics: not needed” has no hidden concerns, so the AI owner has nothing under the surface to reveal and the scoring can’t check whether the trainee found the real worry. Add them in the objection’s Coaching: “What the owner is really worried about”.',
    );
    expect(canPublish(items)).toBe(true);
    expect(readinessWarnings(items).map((i) => i.key)).toContain('objection-concerns');
  });

  it('ticks the row for a coached team objection, and says nothing for a built-in', () => {
    const coached = complete({ pushback_id: COACHED.id });
    expect(readiness(coached, context(coached)).find((i) => i.key === 'objection-concerns')).toMatchObject({ ok: true });
    const builtIn = complete({ pushback_id: 'cost' });
    expect(readiness(builtIn, context(builtIn)).some((i) => i.key === 'objection-concerns')).toBe(false);
  });

  it('says nothing while the objection list hasn’t loaded', () => {
    const draft = complete({ pushback_id: 'team:whatever' });
    const c = buildStudioContext({ draft, source: 'admin', tested: true, docs: null });
    expect(c.objectionConcerns ?? null).toBeNull();
    expect(readiness(draft, c).some((i) => i.key === 'objection-concerns')).toBe(false);
  });
});

// ── 2 · Inherited knowledge the scorer can't read ───────────────

describe('category documents session scoring can’t read', () => {
  it('warns for a cat scenario when no category document is filed for scoring AND cats', () => {
    const draft = complete({ species: 'cat', breed: 'Persian' });
    const c = context(draft);
    expect(c.categoryScoring).toEqual({ name: 'Probiotics', animal: 'cat', attached: 2, readable: 0 });
    const items = readiness(draft, c);
    const item = items.find((i) => i.key === 'category-scoring')!;
    expect(item).toMatchObject({ ok: false, level: 'recommended', step: 'knowledge' });
    expect(item.label).toBe('The scorecard can draw on the Probiotics documents');
    expect(item.detail).toBe(
      'None of the Probiotics documents are filed for scoring for cats, so the scorecard won’t cite them. In Knowledge, add “Session scoring” and cats to at least one of them.',
    );
    expect(canPublish(items)).toBe(true);
  });

  it('is satisfied for an adult dog (one document is filed for scoring and dogs)', () => {
    const draft = complete();
    expect(readiness(draft, context(draft)).find((i) => i.key === 'category-scoring')).toMatchObject({ ok: true });
  });

  it('reads a puppy scenario against the puppy scope', () => {
    const draft = complete({ life_stage: 'Puppy (<1)' });
    expect(context(draft).categoryScoring).toMatchObject({ animal: 'puppy', readable: 0 });
    expect(readiness(draft, context(draft)).find((i) => i.key === 'category-scoring')!.detail).toMatch(
      /filed for scoring for puppies/,
    );
  });

  it('counts an untagged document as the default scope (scoring, every animal)', () => {
    const draft = complete({ species: 'cat' });
    const docs = [doc('study:dog-scoring', null), doc('study:cat-roleplay', { tools: ['roleplay'], species: ['cat'] })];
    expect(context(draft, docs).categoryScoring).toMatchObject({ readable: 1 });
  });

  it('a document missing from the library can’t be read', () => {
    const draft = complete();
    expect(context(draft, [doc('study:cat-roleplay', { tools: ['roleplay'], species: ['cat'] })]).categoryScoring).toMatchObject({
      readable: 0,
    });
  });

  it('never a false warning: nothing while the library hasn’t loaded', () => {
    const draft = complete({ species: 'cat' });
    const c = context(draft, null);
    expect(c.categoryScoring ?? null).toBeNull();
    expect(readiness(draft, c).some((i) => i.key === 'category-scoring')).toBe(false);
  });

  it('says nothing when the scenario picked its own knowledge, or the category has no documents', () => {
    const own = complete({ species: 'cat', knowledge_slugs: ['study:cat-roleplay'] });
    expect(context(own).categoryScoring ?? null).toBeNull();
    const topic = complete({ species: 'cat', focus_area: 'weight' });
    expect(context(topic).categoryScoring ?? null).toBeNull();
    // A topic-only category is a soft filter over the library — nothing to count.
    const topicOnly = categoryScoringReach({
      draft: complete({ species: 'cat' }),
      team: [GENERIC],
      categories: [{ ...PROBIOTICS, knowledgeSlugs: [] }],
      docs: DOCS,
    });
    expect(topicOnly).toBeNull();
    // "Something else" has no category.
    expect(context(complete({ pushback_id: 'custom', pushback_notes: 'x' })).categoryScoring ?? null).toBeNull();
  });

  it('applies to a built-in objection whose (built-in) category has documents', () => {
    const weight: ObjectionCategory = { ...BUILT_IN_CATEGORIES[1], knowledgeSlugs: ['study:cat-roleplay'] };
    const r = categoryScoringReach({
      draft: complete({ pushback_id: 'weight-denial', species: 'cat' }),
      team: [],
      categories: [weight],
      docs: DOCS,
    });
    expect(r).toEqual({ name: weight.name, animal: 'cat', attached: 1, readable: 0 });
  });
});
