import { describe, expect, it, vi } from 'vitest';

// The fetchers are thin wrappers over the api module; mocking it keeps this
// file what it is — a unit test of the pure presentation vocabulary.
const { postJson } = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock('../../lib/api', () => ({ postJson, apiFetch: vi.fn() }));

import {
  batchOutcomeMessage,
  categoryLabel,
  deleteConsequences,
  docCitation,
  filterKnowledgeDocs,
  resolveDocFocus,
  resolveDocScope,
  scenariosUsingDoc,
  scopeSpeciesSummary,
  scopeToolsSummary,
  searchKnowledge,
  sourceLabel,
} from '../knowledgeActions';
import type { KnowledgeDocument } from '../types';

function doc(over: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: over.slug ?? 'id-1',
    slug: 'custom:1',
    title: 'A document',
    category: 'custom',
    source: 'admin',
    metadata: null,
    content: 'body',
    updated_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    chunk_count: 3,
    ...over,
  };
}

describe('resolveDocFocus', () => {
  it('reads the nested tag bag written by the uploader', () => {
    expect(resolveDocFocus({ tags: { focus: 'weight' } })).toBe('weight');
  });

  it('reads a flat tag bag (code-seeded documents)', () => {
    expect(resolveDocFocus({ focus: 'urinary' })).toBe('urinary');
  });

  it('falls back to the legacy topic:communication tag', () => {
    expect(resolveDocFocus({ tags: { topic: 'communication' } })).toBe('communication');
    expect(resolveDocFocus({ topic: 'communication' })).toBe('communication');
  });

  it('prefers an explicit focus over the legacy topic', () => {
    expect(resolveDocFocus({ tags: { focus: 'gi', topic: 'communication' } })).toBe('gi');
  });

  it('returns null for missing, empty, or unrelated metadata', () => {
    expect(resolveDocFocus(null)).toBeNull();
    expect(resolveDocFocus({})).toBeNull();
    expect(resolveDocFocus({ tags: { driver: 'Activator' } })).toBeNull();
    expect(resolveDocFocus({ tags: { focus: '' } })).toBeNull();
    expect(resolveDocFocus({ topic: 'weight-loss' })).toBeNull();
  });
});

describe('docCitation', () => {
  it('trims a present citation and drops blank ones', () => {
    expect(docCitation({ citation: '  Davies, 2024  ' })).toBe('Davies, 2024');
    expect(docCitation({ citation: '   ' })).toBeNull();
    expect(docCitation(null)).toBeNull();
  });
});

describe('labels', () => {
  it('maps categories to human type names and falls back to the raw key', () => {
    expect(categoryLabel('driver')).toBe('ECHO driver');
    expect(categoryLabel('act')).toBe('ACT method');
    expect(categoryLabel('mystery')).toBe('mystery');
  });

  it('maps the source enum to Built-in / Uploaded', () => {
    expect(sourceLabel('code-seed')).toBe('Built-in');
    expect(sourceLabel('admin')).toBe('Uploaded');
  });
});

describe('filterKnowledgeDocs', () => {
  const docs = [
    doc({
      id: 'a',
      slug: 'study:davies-2024',
      title: 'Dog owner preferences',
      category: 'clinical',
      metadata: { citation: 'Davies et al., 2024 — Vet Rec', tags: { focus: 'weight' } },
    }),
    doc({
      id: 'b',
      slug: 'driver:Activator',
      title: 'ECHO driver — Activator',
      category: 'driver',
      source: 'code-seed',
      metadata: { driver: 'Activator' },
    }),
    doc({
      id: 'c',
      slug: 'custom:notes',
      title: 'Clinic handout',
      category: 'custom',
      metadata: { tags: { topic: 'communication' } },
    }),
  ];

  it('sorts by category then title', () => {
    expect(filterKnowledgeDocs(docs).map((d) => d.id)).toEqual(['a', 'c', 'b']);
  });

  it('matches the title, the citation, the focus label, and the slug', () => {
    expect(filterKnowledgeDocs(docs, { query: 'handout' }).map((d) => d.id)).toEqual(['c']);
    expect(filterKnowledgeDocs(docs, { query: 'vet rec' }).map((d) => d.id)).toEqual(['a']);
    // "Weight management" is the label, never stored on the row itself.
    expect(filterKnowledgeDocs(docs, { query: 'weight management' }).map((d) => d.id)).toEqual(['a']);
    expect(filterKnowledgeDocs(docs, { query: 'driver:activator' }).map((d) => d.id)).toEqual(['b']);
  });

  it('filters by focus area, including the legacy communication tag', () => {
    expect(filterKnowledgeDocs(docs, { focus: 'weight' }).map((d) => d.id)).toEqual(['a']);
    expect(filterKnowledgeDocs(docs, { focus: 'communication' }).map((d) => d.id)).toEqual(['c']);
    expect(filterKnowledgeDocs(docs, { focus: 'none' }).map((d) => d.id)).toEqual(['b']);
  });

  it('filters by type and combines with search', () => {
    expect(filterKnowledgeDocs(docs, { category: 'clinical' }).map((d) => d.id)).toEqual(['a']);
    expect(
      filterKnowledgeDocs(docs, { category: 'clinical', query: 'handout' }),
    ).toEqual([]);
  });
});

describe('scenariosUsingDoc', () => {
  const target = doc({ slug: 'study:davies-2024', metadata: { tags: { focus: 'weight' } } });
  const titleOf = (id: string) => `Scenario ${id}`;

  it('lists scenarios that attached the document explicitly', () => {
    const links = scenariosUsingDoc(
      target,
      [{ scenario_id: 'seed:0', focus_area: null, knowledge_slugs: ['study:davies-2024'] }],
      titleOf,
    );
    expect(links).toEqual([{ scenario_id: 'seed:0', label: 'Scenario seed:0', via: 'attached' }]);
  });

  it('lists scenarios that share the focus area when nothing is attached', () => {
    const links = scenariosUsingDoc(
      target,
      [{ scenario_id: 'seed:1', focus_area: 'weight', knowledge_slugs: null }],
      titleOf,
    );
    expect(links[0].via).toBe('focus');
  });

  it('ignores a focus match when the scenario pins a different document', () => {
    const links = scenariosUsingDoc(
      target,
      [{ scenario_id: 'seed:2', focus_area: 'weight', knowledge_slugs: ['custom:other'] }],
      titleOf,
    );
    expect(links).toEqual([]);
  });

  it('ignores unrelated scenarios and untagged documents', () => {
    expect(
      scenariosUsingDoc(
        target,
        [{ scenario_id: 'seed:3', focus_area: 'gi', knowledge_slugs: null }],
        titleOf,
      ),
    ).toEqual([]);
    expect(
      scenariosUsingDoc(
        doc({ slug: 'custom:untagged', metadata: null }),
        [{ scenario_id: 'seed:4', focus_area: 'weight', knowledge_slugs: null }],
        titleOf,
      ),
    ).toEqual([]);
  });
});

describe('deleteConsequences', () => {
  it('names every scenario that attached the document', () => {
    const out = deleteConsequences([
      { scenario_id: 'seed:0', label: 'Weight denial', via: 'attached' },
      { scenario_id: 'admin:1', label: 'Raw food', via: 'attached' },
    ]);
    expect(out[0]).toContain('2 scenarios');
    expect(out[0]).toContain('Weight denial');
    expect(out[0]).toContain('Raw food');
    // The delete prunes the links and a restore does not put them back — the
    // reader has to be told that before they click, not after.
    expect(out[0]).toMatch(/does not re-attach/);
  });

  it('separates focus-area users from explicit attachments', () => {
    const out = deleteConsequences([
      { scenario_id: 'seed:1', label: 'Cost', via: 'focus' },
    ]);
    expect(out.some((c) => c.includes('focus area') && c.includes('Cost'))).toBe(true);
  });

  it('says so plainly when nothing uses it, and always names the escape hatch', () => {
    const out = deleteConsequences([]);
    expect(out[0]).toMatch(/No scenario attaches/);
    expect(out.at(-1)).toMatch(/Recently deleted/);
  });
});

describe('batchOutcomeMessage', () => {
  it('reads as a clean success only when nothing failed', () => {
    expect(batchOutcomeMessage({ attempted: 13, noun: 'documents' })).toEqual({
      message: '13 documents indexed.',
      tone: 'success',
    });
  });

  it('reports partial failure with both numbers', () => {
    const out = batchOutcomeMessage({
      attempted: 13,
      failures: ['a: boom', 'b: boom'],
      noun: 'documents',
    });
    expect(out.message).toBe('11 of 13 documents indexed — 2 failed.');
    expect(out.tone).toBe('info');
  });

  it('is an error when everything failed', () => {
    expect(
      batchOutcomeMessage({ attempted: 2, failures: ['a', 'b'], noun: 'studies' }).tone,
    ).toBe('error');
  });

  it('mentions documents skipped because they sit in Recently deleted', () => {
    const out = batchOutcomeMessage({
      attempted: 11,
      skippedDeleted: ['driver-activator', 'act-guide'],
      noun: 'documents',
    });
    expect(out.message).toContain('2 skipped');
    expect(out.tone).toBe('success');
  });
});

// ─── Scopes (who may retrieve a document, and for which animals) ────────────

describe('resolveDocScope', () => {
  it('defaults an untagged document to the training tools and every species', () => {
    expect(resolveDocScope(null)).toEqual({
      tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
      species: ['dog', 'puppy', 'cat'],
    });
  });

  it('reads the nested tag bag written by the uploader', () => {
    expect(resolveDocScope({ tags: { tools: ['fecal-scan'], species: ['cat'] } })).toEqual({
      tools: ['fecal-scan'],
      species: ['cat'],
    });
  });

  it('reads a flat tag bag and promotes a scalar species', () => {
    expect(resolveDocScope({ tools: ['fecal-scan'], species: 'dog' })).toEqual({
      tools: ['fecal-scan'],
      species: ['dog'],
    });
  });

  it('drops keys outside the vocabulary', () => {
    expect(resolveDocScope({ tags: { tools: ['wizard'], species: ['dragon'] } })).toEqual({
      tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
      species: ['dog', 'puppy', 'cat'],
    });
  });
});

describe('scope summaries', () => {
  it('collapses the default training set to one chip', () => {
    expect(scopeToolsSummary(['roleplay', 'scoring', 'coach', 'scenario-builder'])).toBe(
      'Training (4)',
    );
  });

  it('names a fecal-only document', () => {
    expect(scopeToolsSummary(['fecal-scan'])).toBe('Fecal Scan');
  });

  it('lists a mixed scope in short words', () => {
    expect(scopeToolsSummary(['roleplay', 'fecal-scan'])).toBe('Roleplay · Fecal Scan');
  });

  it('says "All species" only when every species is ticked', () => {
    expect(scopeSpeciesSummary(['dog', 'puppy', 'cat'])).toBe('All species');
    expect(scopeSpeciesSummary(['dog'])).toBe('Adult dog');
    expect(scopeSpeciesSummary(['dog', 'puppy'])).toBe('Adult dog · Puppy');
  });
});

describe('filterKnowledgeDocs — scope filters', () => {
  const scoped = [
    doc({
      id: 'fecal',
      slug: 'fecal:dog',
      title: 'Fecal scoring — dog',
      category: 'clinical',
      metadata: { tags: { tools: ['fecal-scan'], species: ['dog'] } },
    }),
    doc({
      id: 'study',
      slug: 'study:davies',
      title: 'Owner preferences',
      category: 'clinical',
      metadata: { tags: { focus: 'weight' } },
    }),
  ];

  it('matches a document whose scope CONTAINS the requested tool', () => {
    expect(filterKnowledgeDocs(scoped, { tool: 'fecal-scan' }).map((d) => d.id)).toEqual([
      'fecal',
    ]);
    expect(filterKnowledgeDocs(scoped, { tool: 'roleplay' }).map((d) => d.id)).toEqual(['study']);
  });

  it('matches a document whose scope CONTAINS the requested species', () => {
    expect(filterKnowledgeDocs(scoped, { species: 'cat' }).map((d) => d.id)).toEqual(['study']);
    expect(filterKnowledgeDocs(scoped, { species: 'dog' }).map((d) => d.id)).toEqual([
      'fecal',
      'study',
    ]);
  });

  it("'all' leaves both filters off", () => {
    expect(filterKnowledgeDocs(scoped, { tool: 'all', species: 'all' })).toHaveLength(2);
  });

  it('searches the scope labels, not just the raw keys', () => {
    expect(filterKnowledgeDocs(scoped, { query: 'fecal scan' }).map((d) => d.id)).toEqual([
      'fecal',
    ]);
    expect(filterKnowledgeDocs(scoped, { query: 'adult dog' }).map((d) => d.id)).toEqual(['fecal']);
  });
});

describe('searchKnowledge', () => {
  it('POSTs the request straight to admin-knowledge-search', async () => {
    const body = { results: [], appliedFilter: {}, focusRelaxed: false, latencyMs: 12 };
    postJson.mockResolvedValueOnce(body);

    const res = await searchKnowledge({
      query: 'loose stool',
      tool: 'fecal-scan',
      species: 'dog',
      k: 4,
    });

    expect(res).toBe(body);
    expect(postJson).toHaveBeenCalledWith('admin-knowledge-search', {
      query: 'loose stool',
      tool: 'fecal-scan',
      species: 'dog',
      k: 4,
    });
  });
});
