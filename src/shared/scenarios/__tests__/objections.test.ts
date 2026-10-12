import { describe, expect, it } from 'vitest';
import {
  OBJECTION_LIMITS,
  isKnownObjectionId,
  isTeamObjectionId,
  objectionAppliesTo,
  objectionCatalog,
  objectionIdFromTitle,
  objectionText,
  resolveObjection,
  rowToTeamObjection,
  teamObjectionKnowledge,
  teamObjectionToRow,
  validateObjectionInput,
  type TeamObjection,
} from '../objections';
import { PUSHBACK_IDS } from '../enums';
import { SCENARIO_WIRE_MAX } from '../limits';

const probiotics = (over: Partial<TeamObjection> = {}): TeamObjection => ({
  id: 'team:probiotics-not-needed',
  title: "Probiotics: 'he doesn't need them'",
  example: '"He seems fine — why would he need a probiotic?"',
  titleFr: null,
  exampleFr: null,
  species: ['dog', 'cat'],
  focusArea: 'gi',
  coaching: { rootConcerns: ['Thinks supplements are an upsell'] },
  visible: true,
  sortOrder: null,
  updatedAt: null,
  ...over,
});

describe('ids', () => {
  it('team ids carry the prefix and a lowercase slug; built-ins never match', () => {
    expect(isTeamObjectionId('team:probiotics')).toBe(true);
    expect(isTeamObjectionId('team:a')).toBe(false);
    expect(isTeamObjectionId('team:Probiotics')).toBe(false);
    expect(isTeamObjectionId('team:-x')).toBe(false);
    expect(isTeamObjectionId('probiotics')).toBe(false);
    for (const id of PUSHBACK_IDS) expect(isTeamObjectionId(id)).toBe(false);
  });

  it('allocates a readable, unique id from a title', () => {
    expect(objectionIdFromTitle("Probiotics: 'yogurt is enough'")).toBe('team:probiotics-yogurt-is-enough');
    expect(objectionIdFromTitle('Probiotiques : « chat difficile »')).toBe('team:probiotiques-chat-difficile');
    expect(objectionIdFromTitle('Cost', ['team:cost'])).toBe('team:cost-2');
    expect(objectionIdFromTitle('Cost', ['team:cost', 'team:cost-2'])).toBe('team:cost-3');
    expect(objectionIdFromTitle('!!!')).toBe('team:objection');
    expect(isTeamObjectionId(objectionIdFromTitle('x'.repeat(200)))).toBe(true);
    expect(isTeamObjectionId(objectionIdFromTitle('é'))).toBe(true);
  });

  it('the longest valid team id still passes the AI wire cap', () => {
    // sanitizeScenario rejects a pushback id over SCENARIO_WIRE_MAX.pushbackId,
    // so an id the database accepts must never fail every conversation.
    const longest = `team:a${'b'.repeat(58)}c`;
    expect(isTeamObjectionId(longest)).toBe(true);
    expect(isTeamObjectionId(`team:a${'b'.repeat(59)}c`)).toBe(false);
    expect(longest.length).toBeLessThanOrEqual(SCENARIO_WIRE_MAX.pushbackId);
  });

  it('knows built-ins always and team ids only when listed', () => {
    expect(isKnownObjectionId('cost')).toBe(true);
    expect(isKnownObjectionId('team:probiotics')).toBe(false);
    expect(isKnownObjectionId('team:probiotics', ['team:probiotics'])).toBe(true);
    expect(isKnownObjectionId('made-up', ['made-up'])).toBe(false);
  });
});

describe('rowToTeamObjection', () => {
  it('reads a stored row', () => {
    const o = rowToTeamObjection({
      id: 'team:probiotics',
      title: '  Probiotics  ',
      example: 'Yogurt is enough',
      title_fr: 'Probiotiques',
      example_fr: '',
      species: ['cat', 'dog', 'horse'],
      focus_area: 'gi',
      coaching: { rootConcerns: ['a', 'a', ' ', 'b'], bogus: ['x'] },
      visible: false,
      sort_order: 3.6,
      updated_at: '2026-10-12T00:00:00Z',
    });
    expect(o).toEqual({
      id: 'team:probiotics',
      title: 'Probiotics',
      example: 'Yogurt is enough',
      titleFr: 'Probiotiques',
      exampleFr: null,
      species: ['dog', 'cat'],
      focusArea: 'gi',
      coaching: { rootConcerns: ['a', 'b'] },
      visible: false,
      sortOrder: 4,
      updatedAt: '2026-10-12T00:00:00Z',
    });
  });

  it('drops what cannot be a usable objection', () => {
    expect(rowToTeamObjection(null)).toBeNull();
    expect(rowToTeamObjection({ id: 'cost', title: 'x', species: ['dog'] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: ' ', species: ['dog'] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: [] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: ['dog'], focus_area: 'nope' })?.focusArea).toBeNull();
  });

  it('round-trips the camelCase snapshot shape', () => {
    const o = probiotics();
    expect(rowToTeamObjection(o)).toEqual(o);
  });
});

describe('validateObjectionInput', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    id: 'team:probiotics',
    title: 'Probiotics',
    example: 'Yogurt is enough',
    species: ['dog'],
    focusArea: 'gi',
    coaching: {},
    ...over,
  });

  it('accepts a complete objection and cleans it', () => {
    const r = validateObjectionInput(input({ coaching: { watchOuts: Array(10).fill('').map((_, i) => `w${i}`) } }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.coaching.watchOuts).toHaveLength(OBJECTION_LIMITS.coachingItems);
      expect(r.value.visible).toBe(true);
      expect(r.value.titleFr).toBeNull();
    }
  });

  it('explains what is missing or wrong', () => {
    const err = (over: Record<string, unknown>) => {
      const r = validateObjectionInput(input(over));
      return r.ok ? null : r.error;
    };
    expect(err({ id: 'probiotics' })).toMatch(/team:/);
    expect(err({ title: ' ' })).toMatch(/name/);
    expect(err({ title: 'x'.repeat(81) })).toMatch(/too long/);
    expect(err({ example: '' })).toMatch(/owner would typically say/);
    expect(err({ species: [] })).toMatch(/animals/);
    expect(err({ species: ['dog', 'horse'] })).toMatch(/animals/);
    expect(err({ focusArea: 'probiotics' })).toMatch(/topic/);
    expect(err({ titleFr: 5 })).toMatch(/text/);
    expect(err({ visible: 'yes' })).toMatch(/visible/);
    expect(validateObjectionInput(null).ok).toBe(false);
  });

  it('maps to the stored columns', () => {
    const r = validateObjectionInput(input({ titleFr: 'Probiotiques' }));
    expect(r.ok && teamObjectionToRow(r.value)).toMatchObject({
      id: 'team:probiotics',
      title_fr: 'Probiotiques',
      focus_area: 'gi',
      species: ['dog'],
    });
  });
});

describe('catalogue', () => {
  it('lists built-ins (without Other) then visible team objections', () => {
    const ids = objectionCatalog([
      probiotics({ id: 'team:zeta', title: 'Zeta' }),
      probiotics({ id: 'team:alpha', title: 'Alpha' }),
      probiotics({ id: 'team:retired', title: 'Retired', visible: false }),
    ]).map((o) => o.id);
    expect(ids).toEqual([...PUSHBACK_IDS.filter((id) => id !== 'custom'), 'team:alpha', 'team:zeta']);
  });

  it('keeps retired ones for resolution and Other on request', () => {
    const ids = objectionCatalog([probiotics({ visible: false })], { includeHidden: true, includeCustom: true }).map(
      (o) => o.id,
    );
    expect(ids).toContain('team:probiotics-not-needed');
    expect(ids).toContain('custom');
  });

  it('applies by species; absent species means dog', () => {
    expect(objectionAppliesTo(probiotics({ species: ['cat'] }), 'cat')).toBe(true);
    expect(objectionAppliesTo(probiotics({ species: ['cat'] }), undefined)).toBe(false);
    expect(objectionAppliesTo(probiotics({ species: ['dog'] }), null)).toBe(true);
  });

  it('falls back to English when there is no French text', () => {
    expect(objectionText(probiotics(), 'fr').title).toBe(probiotics().title);
    expect(objectionText(probiotics({ titleFr: 'Probiotiques' }), 'fr').title).toBe('Probiotiques');
    expect(objectionText(probiotics({ titleFr: 'Probiotiques' }), 'en').title).toBe(probiotics().title);
  });

  it('shapes coaching like the built-in taxonomy', () => {
    const k = teamObjectionKnowledge(probiotics());
    expect(k.examples).toEqual([probiotics().example]);
    expect(k.rootConcerns).toEqual(['Thinks supplements are an upsell']);
    expect(k.watchOuts).toEqual([]);
  });
});

describe('resolveObjection', () => {
  it('resolves built-ins from code and team ids from the list, retired included', () => {
    expect(resolveObjection('cost')).toEqual({
      id: 'cost',
      title: 'Cost / price pushback',
      example: '"It\'s too expensive for what it is."',
    });
    const retired = probiotics({ visible: false, titleFr: 'Probiotiques' });
    expect(resolveObjection(retired.id, [retired])).toEqual({
      id: retired.id,
      title: retired.title,
      example: retired.example,
      titleFr: 'Probiotiques',
    });
  });

  it('is null for anything it cannot vouch for', () => {
    expect(resolveObjection(null)).toBeNull();
    expect(resolveObjection('team:gone', [probiotics()])).toBeNull();
    expect(resolveObjection('made-up', [probiotics({ id: 'made-up' as string })])).toBeNull();
  });
});
