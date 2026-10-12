/**
 * The Knowledge step's rules, without a DOM. Each case pins something that
 * retrieval really does server-side, so the step never promises otherwise.
 */
import { describe, expect, it } from 'vitest';
import { emptyAdminDraft } from '../../studioModel';
import {
  attachSlugPatch,
  docStatus,
  draftRetrievalSpecies,
  focusCounts,
  inspectSignature,
  knowledgeModeOf,
  readableDocCount,
  relevanceLabel,
  scopeSentence,
  stepForMissing,
  studioUploadTools,
  switchKnowledgeMode,
  toggleSlug,
  toggleSpeciesKey,
  uploadSpeciesDefault,
} from '../knowledgeModel';
import { doc } from './harness';

const draft = (over = {}) => ({ ...emptyAdminDraft('admin:t'), ...over });

describe('knowledgeModeOf', () => {
  it('documents beat a topic, a topic beats nothing', () => {
    expect(knowledgeModeOf(draft())).toBe('library');
    expect(knowledgeModeOf(draft({ focus_area: 'gi' }))).toBe('focus');
    expect(knowledgeModeOf(draft({ focus_area: 'gi', knowledge_slugs: ['a'] }))).toBe('documents');
    expect(knowledgeModeOf(draft({ knowledge_slugs: [] }))).toBe('library');
    expect(knowledgeModeOf(draft({ focus_area: '  ' }))).toBe('library');
  });
});

describe('switchKnowledgeMode', () => {
  it('to one topic detaches documents and says so', () => {
    const sw = switchKnowledgeMode(draft({ knowledge_slugs: ['a', 'b'] }), 'focus');
    expect(sw.patch).toEqual({ knowledge_slugs: null });
    expect(sw.cleared).toMatch(/Detached 2 attached documents/);
    expect(sw.undo).toEqual({ focus_area: null, knowledge_slugs: ['a', 'b'] });
  });

  it('to specific documents clears the topic', () => {
    const sw = switchKnowledgeMode(draft({ focus_area: 'urinary' }), 'documents');
    expect(sw.patch).toEqual({ focus_area: null });
    expect(sw.cleared).toMatch(/Urinary health/);
  });

  it('to the whole library clears both, and nothing to say when nothing was set', () => {
    const sw = switchKnowledgeMode(draft({ focus_area: 'gi', knowledge_slugs: ['a'] }), 'library');
    expect(sw.patch).toEqual({ focus_area: null, knowledge_slugs: null });
    expect(sw.cleared).toMatch(/topic .*and 1 attached document\./);
    expect(switchKnowledgeMode(draft(), 'library').cleared).toBeNull();
  });
});

describe('docStatus', () => {
  const roleplay = doc({ slug: 'r', tags: { tools: ['roleplay', 'scoring'], species: ['dog', 'puppy', 'cat'] } });
  const fecal = doc({ slug: 'f', tags: { tools: ['fecal-scan'], species: ['cat'] } });
  const dogOnly = doc({ slug: 'd', tags: { tools: ['roleplay'], species: ['dog'] } });

  it('a document the roleplay can’t read is not attachable', () => {
    expect(docStatus(fecal, undefined)).toMatchObject({ usedByRoleplay: false, attachable: false });
    expect(docStatus(roleplay, undefined)).toMatchObject({ usedByRoleplay: true, attachable: true });
  });

  it('species is only checked when the scenario declares one', () => {
    expect(docStatus(dogOnly, undefined).speciesBlock).toBeNull();
    const cat = docStatus(dogOnly, 'cat');
    expect(cat.speciesBlock?.label).toBe('Not for cats');
    expect(cat.attachable).toBe(false);
    // A puppy scenario uses the puppy scope — an adult-dog-only document misses it.
    expect(docStatus(dogOnly, 'puppy').speciesBlock?.label).toBe('Not for puppies');
    expect(docStatus(dogOnly, 'dog').speciesBlock).toBeNull();
  });

  it('untagged documents read as the training tools and every species', () => {
    expect(docStatus(doc({ metadata: null }), 'cat').attachable).toBe(true);
  });

  it('no chunks = not searchable', () => {
    expect(docStatus(doc({ chunk_count: 0 }), undefined).searchable).toBe(false);
  });
});

describe('draftRetrievalSpecies', () => {
  it('mirrors the server: a dog when none is declared, puppy for a young dog, cat for any cat', () => {
    // Absent = dog everywhere — retrieval included, so a cat-only document
    // never grounds a scenario that never chose a species.
    expect(draftRetrievalSpecies(draft())).toBe('dog');
    expect(draftRetrievalSpecies(draft({ species: 'dog', life_stage: 'Puppy (<1)' }))).toBe('puppy');
    expect(draftRetrievalSpecies(draft({ species: 'dog', life_stage: 'Adult (3-7)' }))).toBe('dog');
    expect(draftRetrievalSpecies(draft({ species: 'cat', life_stage: 'Puppy (<1)' }))).toBe('cat');
  });
});

describe('focusCounts / readableDocCount', () => {
  const docs = [
    doc({ slug: 'a', tags: { focus: 'gi', tools: ['roleplay'], species: ['dog', 'cat'] } }),
    doc({ slug: 'b', tags: { focus: 'gi', tools: ['fecal-scan'] } }),
    doc({ slug: 'c', tags: { focus: 'gi', tools: ['roleplay'] }, chunk_count: 0 }),
    doc({ slug: 'd', tags: { focus: 'urinary', tools: ['roleplay'], species: ['dog'] } }),
  ];

  it('counts only documents the AI customer could actually read', () => {
    const counts = focusCounts(docs, 'cat');
    expect(counts.get('gi')).toBe(1);
    expect(counts.get('urinary')).toBe(0);
    expect(counts.get('weight')).toBe(0);
    expect(focusCounts(docs, 'dog').get('urinary')).toBe(1);
    expect(readableDocCount(docs, undefined)).toBe(2);
  });
});

describe('attaching', () => {
  it('toggleSlug adds, removes and empties to null', () => {
    expect(toggleSlug([], 'a')).toEqual(['a']);
    expect(toggleSlug(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleSlug(['a'], 'a')).toBeNull();
  });

  it('an upload lands in documents mode, once', () => {
    expect(attachSlugPatch(draft({ focus_area: 'gi' }), 'new')).toEqual({
      knowledge_slugs: ['new'],
      focus_area: null,
    });
    expect(attachSlugPatch(draft({ knowledge_slugs: ['new'] }), 'new').knowledge_slugs).toEqual(['new']);
  });
});

describe('upload defaults', () => {
  it('always files for the roleplay customer and the scorer', () => {
    const tools = studioUploadTools();
    expect(tools).toContain('roleplay');
    expect(tools).toContain('scoring');
    expect(tools).not.toContain('fecal-scan');
  });

  it('species follow the scenario', () => {
    expect(uploadSpeciesDefault(draft({ species: 'cat' }))).toEqual(['cat']);
    expect(uploadSpeciesDefault(draft({ species: 'dog' }))).toEqual(['dog', 'puppy']);
    expect(uploadSpeciesDefault(draft())).toEqual(['dog', 'puppy', 'cat']);
    expect(toggleSpeciesKey(['cat'], 'dog')).toEqual(['dog', 'cat']);
    expect(toggleSpeciesKey(['dog', 'cat'], 'dog')).toEqual(['cat']);
  });
});

describe('preview helpers', () => {
  it('the signature ignores fields the preview does not depend on', () => {
    const a = draft({ breed: 'Beagle' });
    expect(inspectSignature(a, 'knowledge')).toBe(inspectSignature({ ...a, card_title_override: 'x' }, 'knowledge'));
    expect(inspectSignature(a, 'knowledge')).toBe(inspectSignature({ ...a, prompt_prefix: 'x' }, 'knowledge'));
    expect(inspectSignature(a, 'prompt')).not.toBe(inspectSignature({ ...a, prompt_prefix: 'x' }, 'prompt'));
    expect(inspectSignature(a, 'knowledge')).not.toBe(inspectSignature({ ...a, breed: 'Pug' }, 'knowledge'));
  });

  it('scope reads as words', () => {
    expect(scopeSentence({ tools: ['roleplay'], species: ['cat'], focus: 'urinary' }, 'focus', 0)).toBe(
      'Searching: roleplay documents · cats · topic: Urinary health',
    );
    expect(scopeSentence({ tools: ['roleplay'] }, 'documents', 3)).toBe(
      'Searching: roleplay documents · every species · only the 3 attached',
    );
    expect(scopeSentence({ tool: 'roleplay', species: ['puppy'] }, 'library', 0)).toBe(
      'Searching: roleplay documents · puppies · whole library',
    );
  });

  it('relevance and missing-field routing', () => {
    expect(relevanceLabel(0.781)).toBe('78% match');
    expect(relevanceLabel(null)).toBeNull();
    expect(stepForMissing('Breed')).toBe('pet');
    expect(stepForMissing('Life stage')).toBe('pet');
    expect(stepForMissing('Pushback')).toBe('pushback');
    expect(stepForMissing('ECHO driver')).toBe('customer');
  });
});

// ── Category knowledge (inherited) ───────────────────────────

// eslint-disable-next-line import/first
import { inheritedKnowledge, knowledgeSourceSentence, readKnowledgeSource } from '../knowledgeModel';
// eslint-disable-next-line import/first
import { BUILT_IN_CATEGORIES } from '../../../../../src/shared/scenarios/objectionCategories';

describe('inheritedKnowledge', () => {
  const categories = [
    ...BUILT_IN_CATEGORIES.map((c) => (c.id === 'weight' ? { ...c, knowledgeSlugs: ['study:obesity'] } : c)),
    {
      ...BUILT_IN_CATEGORIES[0],
      id: 'category:probiotics',
      name: 'Probiotics',
      builtIn: false,
      focusArea: 'gi',
      knowledgeSlugs: [],
    },
  ];
  const team = [{ id: 'team:pro', categoryId: 'category:probiotics' }];

  it('a scenario with no choice of its own reads its category’s knowledge', () => {
    const r = inheritedKnowledge(draft({ pushback_id: 'weight-denial' }), team, categories);
    expect(r.category?.id).toBe('weight');
    expect(r.knowledge).toEqual({ focusArea: null, knowledgeSlugs: ['study:obesity'] });
    expect(r.source).toBe('category');
    // A topic alone counts as knowledge.
    expect(inheritedKnowledge(draft({ pushback_id: 'team:pro' }), team, categories)).toMatchObject({
      knowledge: { focusArea: 'gi', knowledgeSlugs: [] },
      source: 'category',
    });
  });

  it('its own documents or topic replace the category’s', () => {
    expect(inheritedKnowledge(draft({ pushback_id: 'weight-denial', focus_area: 'urinary' }), team, categories).source).toBe(
      'scenario',
    );
    expect(
      inheritedKnowledge(draft({ pushback_id: 'weight-denial', knowledge_slugs: ['study:a'] }), team, categories).source,
    ).toBe('scenario');
  });

  it('a category with nothing attached, "Something else" and no objection read the whole library', () => {
    expect(inheritedKnowledge(draft({ pushback_id: 'cost' }), team, categories)).toMatchObject({
      knowledge: null,
      source: 'library',
    });
    expect(inheritedKnowledge(draft({ pushback_id: 'custom' }), team, categories)).toEqual({
      category: null,
      knowledge: null,
      source: 'library',
    });
    expect(inheritedKnowledge(draft(), team, categories).category).toBeNull();
  });
});

describe('readKnowledgeSource', () => {
  it('reads the inspector’s knowledgeSource + knowledgeCategory', () => {
    expect(
      readKnowledgeSource({
        knowledgeSource: 'category',
        knowledgeCategory: { id: 'weight', name: 'Obesity & weight loss', focusArea: null, knowledgeSlugs: ['a'] },
      }),
    ).toEqual({
      source: 'category',
      categoryId: 'weight',
      categoryName: 'Obesity & weight loss',
      categoryHasKnowledge: true,
      categoryDocCount: 1,
    });
    expect(readKnowledgeSource({ knowledgeSource: 'library', knowledgeCategory: null })).toEqual({
      source: 'library',
      categoryId: null,
      categoryName: null,
      categoryHasKnowledge: false,
      categoryDocCount: 0,
    });
  });

  it('an inheriting scenario’s search reads “only the N attached” of its category, not “whole library”', () => {
    const src = readKnowledgeSource({
      knowledgeSource: 'category',
      knowledgeCategory: { id: 'category:dental', name: 'Dental', focusArea: null, knowledgeSlugs: ['custom:a'] },
    })!;
    // The applied filter never lists doc slugs (they ride a separate RPC argument).
    expect(scopeSentence({ tools: ['roleplay'], species: ['cat'] }, 'documents', src.categoryDocCount)).toBe(
      'Searching: roleplay documents · cats · only the 1 attached',
    );
  });

  it('is null when an older server didn’t say', () => {
    expect(readKnowledgeSource({ knowledge: {} })).toBeNull();
    expect(readKnowledgeSource({ knowledgeSource: 'elsewhere' })).toBeNull();
    expect(readKnowledgeSource(null)).toBeNull();
  });

  it('says it in one plain line', () => {
    expect(knowledgeSourceSentence('category', 'Probiotics')).toBe('Reading the knowledge attached to its category, Probiotics.');
    expect(knowledgeSourceSentence('scenario', 'Probiotics', true)).toMatch(/replaces what Probiotics gives its scenarios/);
    expect(knowledgeSourceSentence('scenario', 'Probiotics', false)).toBe('Reading this scenario’s own choice of knowledge.');
    expect(knowledgeSourceSentence('library', null)).toMatch(/^Reading the whole library/);
  });
});
