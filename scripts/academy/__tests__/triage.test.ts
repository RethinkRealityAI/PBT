// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { THEME_FOCUS, focusFor, mapSpecies, triage, unmappedThemes, type TriageInput } from '../triage';
import { FOCUS_AREA_KEYS } from '../../../src/shared/knowledge/focusAreas';

const input = (over: Partial<TriageInput>): TriageInput => ({
  title: 'An article',
  description: '',
  themes: [],
  topics: [],
  keywords: [],
  species: ['Dog'],
  ...over,
});

describe('mapSpecies — the site taxonomy → the HARD species scope', () => {
  it('maps Dog to dog + puppy, Cat to cat, both to all three, none to all three', () => {
    expect(mapSpecies(['Dog'])).toEqual(['dog', 'puppy']);
    expect(mapSpecies(['Cat'])).toEqual(['cat']);
    expect(mapSpecies(['Cat', 'Dog'])).toEqual(['dog', 'puppy', 'cat']);
    expect(mapSpecies([])).toEqual(['dog', 'puppy', 'cat']);
  });
});

describe('focusFor', () => {
  it('maps every table theme to a real focus area', () => {
    for (const f of Object.values(THEME_FOCUS)) expect(FOCUS_AREA_KEYS).toContain(f);
  });

  it('first mapped theme wins', () => {
    expect(focusFor({ themes: ['Nutrition', 'Overweight / Obesity', 'Dermatology'], title: '', keywords: [] })).toBe('weight');
    expect(focusFor({ themes: ['Practice Management'], title: '', keywords: [] })).toBe('communication');
  });

  it('falls back to title, then keyword wording, when no theme maps', () => {
    expect(focusFor({ themes: ['Nutrition'], title: 'Feeding the obese cat', keywords: [] })).toBe('weight');
    expect(focusFor({ themes: ['Pediatrics'], title: 'Weaning diarrhea in puppies', keywords: [] })).toBe('gi');
    expect(focusFor({ themes: ['Other'], title: 'Something', keywords: ['struvite'] })).toBe('urinary');
    expect(focusFor({ themes: ['Other'], title: 'Something', keywords: [] })).toBeNull();
  });

  it('lists themes without a focus mapping for review', () => {
    expect(unmappedThemes(['Nutrition', 'Dermatology', 'Cardiology'])).toEqual(['Nutrition', 'Cardiology']);
  });
});

describe('triage', () => {
  it('approves on-topic themes with a reason naming them', () => {
    const p = triage(input({ themes: ['Overweight / Obesity'], title: 'How I approach... Pet obesity', species: ['Cat', 'Dog'] }));
    expect(p).toMatchObject({ approved: true, focus: 'weight', species: ['dog', 'puppy', 'cat'] });
    expect(p.reason).toMatch(/Overweight \/ Obesity/);
  });

  it('rejects procedure-led specialties by theme', () => {
    expect(triage(input({ themes: ['Cardiology', 'Nutrition'], title: 'Diet and canine DCM' })).approved).toBe(false);
    expect(triage(input({ themes: ['Emergency and Critical Care'], title: 'Feeding hospitalised cats' })).approved).toBe(false);
  });

  it.each([
    ['Minimally invasive bladder urolith removal', 'surgery'],
    ['Circularity in the operating theatre', 'surgery'],
    ['Front line ultrasound imaging of the feline kidney', 'imaging'],
    ['Feline infectious peritonitis', 'infectious'],
    ['Machine learning model for an app based tool', 'AI'],
    ['Getting your first job', 'careers'],
    ['COVID-19: putting the team first', 'COVID'],
    ['Climate change, veterinary practice and pet nutrition', 'sustainability'],
  ])('rejects "%s" (%s) by title even under an on-topic theme', (title) => {
    expect(triage(input({ themes: ['Nutrition', 'Practice Management'], title })).approved).toBe(false);
  });

  it('lets an obesity article through the genetics rule', () => {
    expect(triage(input({ themes: ['Overweight / Obesity'], title: 'Canine genetics and obesity' })).approved).toBe(true);
  });

  it('approves a diet-gated theme only with diet or client wording', () => {
    expect(triage(input({ themes: ['Dermatology'], title: 'How to do a food trial' })).approved).toBe(true);
    expect(triage(input({ themes: ['Dermatology'], title: 'Canine pemphigus', description: 'Immune disease.' })).approved).toBe(false);
  });

  it('is deterministic', () => {
    const i = input({ themes: ['Gastroenterology'], title: 'Dietary fiber', keywords: ['fibre'] });
    expect(triage(i)).toEqual(triage(i));
  });
});
