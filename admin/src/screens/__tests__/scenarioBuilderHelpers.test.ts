/**
 * Scenario Builder — the pure helpers behind the destructive-action copy,
 * the client-side duplicate, and the two "are you about to break the app?"
 * guards.
 *
 * These exist because every one of them is a sentence shown to someone right
 * before they do something irreversible: if the field list is wrong, the
 * confirmation dialog lies.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDuplicateDraft,
  matchEnumSuggestion,
  missingKnowledgeSlugs,
  overriddenFieldLabels,
  visibleScenarioCount,
} from '../ScenarioBuilderScreen';
import { PERSONAS, PUSHBACK_IDS } from '../../../../src/shared/scenarios/enums';
import type { ScenarioOverrideRow } from '../../data/types';

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
      } as Partial<ScenarioOverrideRow>),
    ).toEqual([]);
  });

  it('only counts `visible` when it differs from how the scenario ships', () => {
    expect(overriddenFieldLabels({ visible: true }, { baseVisible: true })).toEqual([]);
    expect(overriddenFieldLabels({ visible: false }, { baseVisible: true })).toEqual([
      'Visible in app (currently hidden)',
    ]);
  });
});

describe('missingKnowledgeSlugs', () => {
  it('finds attachments with no live document behind them', () => {
    expect(
      missingKnowledgeSlugs(['study:a', 'study:gone'], ['study:a', 'study:b']),
    ).toEqual(['study:gone']);
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
  const source: Partial<ScenarioOverrideRow> = {
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
    expect(buildDuplicateDraft(source, 'admin:x').card_title_override).toBe(
      '(copy) Weight denial',
    );
    expect(
      buildDuplicateDraft(
        { ...source, card_title_override: null },
        'admin:x',
        'Cost pushback',
      ).card_title_override,
    ).toBe('(copy) Cost pushback');
  });

  it('keeps the card title inside the column limit', () => {
    const long = 'x'.repeat(200);
    const copy = buildDuplicateDraft({ ...source, card_title_override: long }, 'admin:x');
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
    // seed:0 + admin:1 — seed:1 is hidden, user:1 belongs to one account.
    expect(visibleScenarioCount(entries)).toBe(2);
  });

  it('can exclude the scenario being edited, which is the guard the editor needs', () => {
    expect(visibleScenarioCount(entries, 'admin:1')).toBe(1);
    expect(
      visibleScenarioCount([entries[1], entries[2], entries[3]], 'admin:1'),
    ).toBe(0);
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
    expect(
      matchEnumSuggestion('Anxious — worried about getting it wrong', PERSONAS),
    ).toBe('Anxious');
  });

  it('refuses free text rather than writing an invalid enum', () => {
    expect(
      matchEnumSuggestion('Owner is worried about grain content', PUSHBACK_IDS),
    ).toBeNull();
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
