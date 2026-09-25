import { describe, expect, it } from 'vitest';
import {
  adaptToSpecies,
  buildCoachHintSystemPrompt,
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  buildVoiceSystemPrompt,
} from '../promptBuilders';
import { PROMPT_FIXTURE_CASES, type PromptFixtureCase } from './promptFixtureCases';
import {
  PUSHBACK_CATEGORIES,
  SEED_SCENARIOS,
  type Scenario,
} from '../../scenarios';
import { DRIVER_KEYS } from '../../../design-system/tokens';
import type { RetrievedChunk } from '../../../services/ragShared';

/**
 * Dog / cat prompts (Scenario Studio §5).
 *
 * Two properties:
 *  1. A dog — explicit `species: 'dog'` or no species at all — produces the
 *     SAME bytes as before species existed (the `__fixtures__/en` parity
 *     suite pins the absent case; this pins explicit dog to absent).
 *  2. A cat prompt talks about a cat everywhere the canned brief talks about
 *     the pet — while the author's own text and retrieved research are left
 *     exactly as written.
 */

type Locale = 'en' | 'fr';
const LOCALES: Locale[] = ['en', 'fr'];

function build(c: PromptFixtureCase, scenario: Scenario, locale: Locale): string {
  const base = {
    scenario,
    overrides: c.overrides,
    config: c.config,
    retrieved: c.retrieved,
    locale,
  };
  switch (c.builder) {
    case 'customer':
      return buildCustomerSystemPrompt(base);
    case 'voice':
      return buildVoiceSystemPrompt(base);
    case 'scoring':
      return buildScoringSystemPrompt(base);
    case 'coach':
      return buildCoachHintSystemPrompt(base);
  }
}

/** Every builder, for one scenario, with no retrieval or admin wraps. */
function allPrompts(scenario: Scenario, locale: Locale): Record<string, string> {
  return {
    customer: buildCustomerSystemPrompt({ scenario, locale }),
    voice: buildVoiceSystemPrompt({ scenario, locale }),
    scoring: buildScoringSystemPrompt({ scenario, locale }),
    coach: buildCoachHintSystemPrompt({ scenario, locale }),
  };
}

/** A cat scenario whose OWN text (context, notes, opening line) is about a cat. */
function catScenario(patch: Partial<Scenario> = {}): Scenario {
  return {
    ...SEED_SCENARIOS[0],
    species: 'cat',
    breed: 'Maine Coon',
    age: 'Adult (3-7)',
    context: 'Milo is a 6-year-old indoor cat, BCS 8/9, free-fed dry food.',
    openingLine: 'He is just a big boy — Maine Coons are supposed to be large.',
    pushbackNotes: undefined,
    weightKg: '8.4',
    ...patch,
  };
}

// "canine" is allowed: the cat-only guardrails name canine data on purpose
// ("the canine DMER multipliers", "a canine study").
const DOG_WORDS = /\b(dog|dogs|puppy|puppies)\b/i;

describe('species — dog prompts are unchanged', () => {
  it.each(PROMPT_FIXTURE_CASES.map((c) => [c.name, c] as const))(
    '%s: explicit dog === no species (en + fr)',
    (_name, c) => {
      const explicitDog: Scenario = { ...c.scenario, species: 'dog' };
      expect(c.scenario.species).toBeUndefined();
      for (const locale of LOCALES) {
        expect(build(c, explicitDog, locale)).toBe(build(c, c.scenario, locale));
      }
    },
  );

  it('an unknown species value is treated as a dog', () => {
    const odd = { ...SEED_SCENARIOS[1], species: 'hamster' } as unknown as Scenario;
    for (const locale of LOCALES) {
      expect(allPrompts(odd, locale)).toEqual(allPrompts(SEED_SCENARIOS[1], locale));
    }
  });

  it('a dog puppy keeps the Puppy label', () => {
    const pup: Scenario = { ...SEED_SCENARIOS[0], species: 'dog', age: 'Puppy (<1)' };
    expect(buildCustomerSystemPrompt({ scenario: pup })).toContain('- Life stage: Puppy (<1)');
  });
});

describe('species — cat prompts', () => {
  it('the customer brief is about the owner of a cat', () => {
    const p = buildCustomerSystemPrompt({ scenario: catScenario() });
    expect(p).toContain('You are the OWNER of the cat.');
    expect(p).toContain('\n# CAT\n- Species: Cat\n- Breed: Maine Coon\n');
    expect(p).toContain('- Cat weight: 8.4 kg');
    expect(p).toContain("the cat's specifics above.");
    expect(p).toContain('share one honest detail about your cat');
    expect(p).toContain('- SPECIES: your pet is a CAT.');
    expect(p).not.toContain('# DOG');
    expect(p).not.toContain('the dog');
    expect(p).not.toContain('Dog weight');
  });

  it('never quotes the canine trial to or about a cat', () => {
    const cat = catScenario();
    const customer = buildCustomerSystemPrompt({ scenario: cat });
    const scoring = buildScoringSystemPrompt({ scenario: cat });
    for (const p of [customer, scoring]) {
      expect(p).not.toContain('97%');
      expect(p).not.toContain('12-week trial');
    }
    expect(customer).toContain('If staff cites specific clinical evidence concretely');
    // The canine BCS cut-offs and DMER multipliers are dog numbers.
    expect(scoring).not.toContain('ideal for most adult dogs');
    expect(scoring).not.toContain('130 × kg^0.75');
    expect(scoring).toContain("Use the clinic's feline");
    expect(scoring).toContain('A cat can be overweight');
    // Species-agnostic product claims survive.
    expect(scoring).toContain('High protein + specialised fibre blend extends satiety');
  });

  it('the scorer and coach see a cat scenario', () => {
    const cat = catScenario();
    const scoring = buildScoringSystemPrompt({ scenario: cat });
    expect(scoring).toContain('- Species: Cat\n- Breed: Maine Coon\n');
    expect(scoring).toContain('- Cat weight: 8.4 kg');
    expect(scoring).toContain("understand the cat's real context");
    const coach = buildCoachHintSystemPrompt({ scenario: cat });
    expect(coach).toContain('- Species: Cat');
    expect(coach).toContain('- Cat weight: 8.4 kg');
  });

  it('a kitten reads as a kitten in every prompt', () => {
    const kitten = catScenario({ age: 'Puppy (<1)' });
    for (const locale of LOCALES) {
      for (const [name, p] of Object.entries(allPrompts(kitten, locale))) {
        expect(p, `${name}/${locale}`).toContain('- Life stage: Kitten (<1)');
        expect(p, `${name}/${locale}`).not.toContain('Puppy (<1)');
      }
    }
  });

  it('carries no dog wording anywhere, for every driver and pushback (en + fr)', () => {
    for (const driver of DRIVER_KEYS) {
      for (const pushback of PUSHBACK_CATEGORIES) {
        const scenario = catScenario({
          suggestedDriver: driver,
          pushback,
          pushbackNotes: pushback.id === 'custom' ? 'Thinks wet food is a scam.' : undefined,
        });
        for (const locale of LOCALES) {
          for (const [name, p] of Object.entries(allPrompts(scenario, locale))) {
            const where = `${name}/${locale}/${driver}/${pushback.id}`;
            expect(p, where).toMatch(/\bcat\b/);
            expect(p, where).not.toMatch(DOG_WORDS);
            expect(p, where).not.toMatch(/\bchien|\bchiot/);
          }
        }
      }
    }
  });

  it('adapts the French dialect examples ("mon chien" → "mon chat")', () => {
    const customer = buildCustomerSystemPrompt({ scenario: catScenario(), locale: 'fr' });
    const voice = buildVoiceSystemPrompt({ scenario: catScenario(), locale: 'fr' });
    expect(customer).toContain('"mon chat file pas"');
    expect(voice).toContain('"mon chat file pas"');
    const scoring = buildScoringSystemPrompt({ scenario: catScenario(), locale: 'fr' });
    expect(scoring).toContain('Never translate ECHO driver names, cat breeds');
  });

  it('adapts admin-configured persona text too (the config is shared by both species)', () => {
    const p = buildCustomerSystemPrompt({
      scenario: catScenario({ suggestedDriver: 'Activator' }),
      config: {
        drivers: {
          Activator: { customerSamplePhrasings: ["My dog eats whatever's cheapest."] },
        },
      },
    });
    expect(p).toContain("- My cat eats whatever's cheapest.");
  });

  it("leaves the author's own text and retrieved research exactly as written", () => {
    const retrieved: RetrievedChunk[] = [
      {
        content: 'In 2019, 59% of dogs seen in clinics were overweight.',
        citation: 'Smith, 2020',
        tags: null,
        similarity: 0.9,
      },
    ];
    const scenario = catScenario({
      context: 'Lives with the family dog, who steals her food.',
      pushbackNotes: 'The owner compares her to their old dog.',
    });
    const customer = buildCustomerSystemPrompt({
      scenario,
      retrieved,
      overrides: { promptPrefix: 'Mention the dog next door once.' },
    });
    expect(customer).toContain('Lives with the family dog, who steals her food.');
    expect(customer).toContain('The owner compares her to their old dog.');
    expect(customer).toContain('Mention the dog next door once.');
    expect(customer).toContain('59% of dogs seen in clinics were overweight');
    const scoring = buildScoringSystemPrompt({ scenario, retrieved });
    expect(scoring).toContain('59% of dogs seen in clinics were overweight');
  });
});

describe('adaptToSpecies', () => {
  it('is the identity for a dog or an absent / unknown species', () => {
    const text = "The dog's owner loves dogs. Le chien file pas.";
    for (const species of [undefined, null, 'dog', 'hamster', 'Cat']) {
      expect(adaptToSpecies(text, species)).toBe(text);
    }
  });

  it('swaps whole words only, preserving case', () => {
    expect(
      adaptToSpecies('Dog, dog, DOG, dogs, Dogs, dog\'s, puppy, Puppies, canine', 'cat'),
    ).toBe("Cat, cat, CAT, cats, Cats, cat's, kitten, Kittens, feline");
    expect(adaptToSpecies('hotdog dogma doggy underdogs', 'cat')).toBe(
      'hotdog dogma doggy underdogs',
    );
  });

  it('handles the French forms, and never produces "chatte"', () => {
    expect(adaptToSpecies('mon chien, les chiens, un chiot', 'cat')).toBe(
      'mon chat, les chats, un chaton',
    );
    expect(adaptToSpecies('sa chienne', 'cat')).toBe('sa chienne');
  });
});
