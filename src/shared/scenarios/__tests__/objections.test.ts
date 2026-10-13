import { describe, expect, it } from 'vitest';
import {
  OBJECTION_LIMITS,
  hasCoachingFr,
  isKnownObjectionId,
  mentionsCoachingFr,
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
  categoryId: 'category:probiotics',
  coaching: { rootConcerns: ['Thinks supplements are an upsell'] },
  coachingFr: {},
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
      category_id: 'category:probiotics',
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
      categoryId: 'category:probiotics',
      coaching: { rootConcerns: ['a', 'b'] },
      coachingFr: {},
      visible: false,
      sortOrder: 4,
      updatedAt: '2026-10-12T00:00:00Z',
    });
  });

  it('reads the French hint lists nested in the stored coaching (`coaching.fr`)', () => {
    const o = rowToTeamObjection({
      id: 'team:probiotics',
      title: 'Probiotics',
      example: 'Yogurt is enough',
      species: ['dog'],
      category_id: 'category:probiotics',
      coaching: {
        acknowledgePatterns: ['That makes sense.'],
        fr: {
          acknowledgePatterns: ['  C’est logique.  ', 'C’est logique.', ''],
          clarifyQuestions: ['Qu’avez-vous remarqué?'],
          // AI-only lists have no French version: dropped, like unknown keys.
          rootConcerns: ['Pense que c’est un coût de plus'],
          bogus: ['x'],
        },
      },
      visible: true,
    });
    // The English lists are untouched by the nested `fr` key.
    expect(o?.coaching).toEqual({ acknowledgePatterns: ['That makes sense.'] });
    expect(o?.coachingFr).toEqual({
      acknowledgePatterns: ['C’est logique.'],
      clarifyQuestions: ['Qu’avez-vous remarqué?'],
    });
  });

  it('caps the French lists with the same limits as the English ones', () => {
    const long = 'é'.repeat(OBJECTION_LIMITS.coachingItemMax + 50);
    const o = rowToTeamObjection({
      id: 'team:probiotics',
      title: 'Probiotics',
      species: ['dog'],
      category_id: 'weight',
      coaching: { fr: { takeActionPatterns: [long, ...Array.from({ length: 10 }, (_, i) => `étape ${i}`)] } },
    });
    expect(o?.coachingFr.takeActionPatterns).toHaveLength(OBJECTION_LIMITS.coachingItems);
    expect(o?.coachingFr.takeActionPatterns?.[0]).toHaveLength(OBJECTION_LIMITS.coachingItemMax);
  });

  it('a malformed `fr` reads as no French at all', () => {
    for (const fr of [null, 'oui', ['x'], 5]) {
      const o = rowToTeamObjection({
        id: 'team:probiotics',
        title: 'P',
        species: ['dog'],
        category_id: 'weight',
        coaching: { clarifyQuestions: ['Q?'], fr },
      });
      expect(o?.coachingFr).toEqual({});
      expect(o?.coaching).toEqual({ clarifyQuestions: ['Q?'] });
    }
  });

  it('drops what cannot be a usable objection', () => {
    expect(rowToTeamObjection(null)).toBeNull();
    expect(rowToTeamObjection({ id: 'cost', title: 'x', species: ['dog'] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: ' ', species: ['dog'] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: [], category_id: 'weight' })).toBeNull();
    // Every team objection belongs to a category (built-in or team-shaped id).
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: ['dog'] })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: ['dog'], category_id: 'nope' })).toBeNull();
    expect(rowToTeamObjection({ id: 'team:x1', title: 'X', species: ['dog'], category_id: 'weight' })?.categoryId).toBe('weight');
  });

  it('round-trips the camelCase snapshot shape', () => {
    const o = probiotics();
    expect(rowToTeamObjection(o)).toEqual(o);
    const withFr = probiotics({ coachingFr: { clarifyQuestions: ['Qu’est-ce qui vous inquiète?'] } });
    expect(rowToTeamObjection(withFr)).toEqual(withFr);
  });
});

describe('French hint lists — row ⇄ objection', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    id: 'team:probiotics',
    title: 'Probiotics',
    example: 'Yogurt is enough',
    species: ['dog'],
    categoryId: 'category:probiotics',
    coaching: { acknowledgePatterns: ['Fair question.'], rootConcerns: ['Upsell'] },
    ...over,
  });

  it('stores them inside coaching as `fr` and reads them back', () => {
    const r = validateObjectionInput(
      input({
        coachingFr: {
          acknowledgePatterns: ['Bonne question.'],
          takeActionPatterns: ['Essai de 4 semaines, avec un suivi.'],
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = teamObjectionToRow(r.value);
    expect(row.coaching).toEqual({
      acknowledgePatterns: ['Fair question.'],
      rootConcerns: ['Upsell'],
      fr: {
        acknowledgePatterns: ['Bonne question.'],
        takeActionPatterns: ['Essai de 4 semaines, avec un suivi.'],
      },
    });
    const back = rowToTeamObjection({ ...row, updated_at: null });
    expect(back).toEqual({ ...r.value, updatedAt: null });
  });

  it('omits `fr` when there is no French, so the stored coaching is unchanged', () => {
    for (const coachingFr of [undefined, null, {}, { clarifyQuestions: ['  ', ''] }]) {
      const r = validateObjectionInput(input({ coachingFr }));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.coachingFr).toEqual({});
      expect(teamObjectionToRow(r.value).coaching).toEqual({
        acknowledgePatterns: ['Fair question.'],
        rootConcerns: ['Upsell'],
      });
    }
  });

  it('keeps only the three trainee-hint lists, with the English limits', () => {
    const r = validateObjectionInput(
      input({
        coachingFr: {
          clarifyQuestions: Array.from({ length: 9 }, (_, i) => `Question ${i}?`),
          rootConcerns: ['Réservé à l’IA'],
          watchOuts: ['Réservé à l’IA'],
        },
      }),
    );
    expect(r.ok && r.value.coachingFr).toEqual({
      clarifyQuestions: Array.from({ length: OBJECTION_LIMITS.coachingItems }, (_, i) => `Question ${i}?`),
    });
  });

  it('accepts the stored shape (`coaching.fr`) too, and never leaks it into the English lists', () => {
    const r = validateObjectionInput(input({ coaching: { clarifyQuestions: ['Q?'], fr: { clarifyQuestions: ['Q ?'] } } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.coaching).toEqual({ clarifyQuestions: ['Q?'] });
    expect(r.value.coachingFr).toEqual({ clarifyQuestions: ['Q ?'] });
  });

  it('refuses a French coaching that is not an object of lists', () => {
    for (const coachingFr of ['oui', ['a'], 3]) {
      const r = validateObjectionInput(input({ coachingFr }));
      expect(r.ok ? null : r.error).toMatch(/coachingFr/);
    }
  });

  it('knows whether a write body mentions French coaching at all', () => {
    expect(mentionsCoachingFr(input())).toBe(false);
    expect(mentionsCoachingFr(input({ coachingFr: {} }))).toBe(true);
    expect(mentionsCoachingFr(input({ coachingFr: null }))).toBe(true);
    expect(mentionsCoachingFr(input({ coaching: { fr: {} } }))).toBe(true);
    expect(mentionsCoachingFr(null)).toBe(false);
  });

  it('hasCoachingFr is true only for a non-empty list', () => {
    expect(hasCoachingFr({})).toBe(false);
    expect(hasCoachingFr(null)).toBe(false);
    expect(hasCoachingFr({ acknowledgePatterns: [] })).toBe(false);
    expect(hasCoachingFr({ takeActionPatterns: ['x'] })).toBe(true);
  });
});

describe('validateObjectionInput', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    id: 'team:probiotics',
    title: 'Probiotics',
    example: 'Yogurt is enough',
    species: ['dog'],
    categoryId: 'category:probiotics',
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
    expect(err({ categoryId: undefined })).toMatch(/category/);
    expect(err({ categoryId: 'Probiotics' })).toMatch(/category/);
    expect(err({ titleFr: 5 })).toMatch(/text/);
    expect(err({ visible: 'yes' })).toMatch(/visible/);
    expect(validateObjectionInput(null).ok).toBe(false);
  });

  it('maps to the stored columns', () => {
    const r = validateObjectionInput(input({ titleFr: 'Probiotiques' }));
    expect(r.ok && teamObjectionToRow(r.value)).toMatchObject({
      id: 'team:probiotics',
      title_fr: 'Probiotiques',
      category_id: 'category:probiotics',
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
