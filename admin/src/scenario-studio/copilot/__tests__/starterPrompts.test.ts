import { describe, it, expect } from 'vitest';
import { STUDIO_STEP_KEYS } from '../../../../../src/shared/ai/scenarioAgent';
import { emptyAdminDraft } from '../../studioModel';
import { composerPlaceholder, greetingFor, isBlankDraft, starterPrompts } from '../starterPrompts';

const blank = emptyAdminDraft('admin:t1');

describe('starterPrompts', () => {
  it.each(STUDIO_STEP_KEYS)('%s offers four distinct, short prompts and a placeholder', (step) => {
    const prompts = starterPrompts(step, blank);
    expect(prompts).toHaveLength(4);
    expect(new Set(prompts).size).toBe(4);
    for (const p of prompts) expect(p.length).toBeLessThanOrEqual(90);
    expect(composerPlaceholder(step)).toMatch(/…$/);
  });

  it('carries the prompts the Studio is built around', () => {
    expect(starterPrompts('pet', blank)).toContain('Suggest a breed where weight denial is common');
    expect(starterPrompts('pushback', blank)).toContain('Write a realistic backstory');
    expect(starterPrompts('customer', blank)).toEqual(
      expect.arrayContaining(['Write three opening lines', 'Make this owner an Analyzer who wants studies']),
    );
    expect(starterPrompts('knowledge', blank)).toContain('Which documents should this scenario use?');
    expect(starterPrompts('brief', blank)).toContain('Make the owner more resistant to price talk');
    expect(starterPrompts('test', blank)).toContain('What should I try in the test drive?');
    expect(starterPrompts('publish', blank)).toContain('Write a catchy card title and subtitle');
  });

  it('tailors to the draft (species, breed, pushback)', () => {
    const cat = { ...blank, species: 'cat' as const, breed: 'Maine Coon', pushback_id: 'weight-denial' };
    const pet = starterPrompts('pet', cat);
    expect(pet[0]).toBe('Suggest a cat breed that fits weight / obesity denial');
    expect(pet.join(' ')).toContain('Maine Coon');
    expect(starterPrompts('pushback', cat)).toContain('What pushback is common for Maine Coon owners?');
  });
});

describe('greetingFor', () => {
  it('invites a description on a blank draft, offers step help otherwise', () => {
    expect(isBlankDraft(blank)).toBe(true);
    expect(greetingFor('pet', blank).title).toMatch(/^Tell me about the conversation/);
    const started = { ...blank, pushback_id: 'cost' };
    expect(isBlankDraft(started)).toBe(false);
    expect(greetingFor('customer', started).title).toBe('Want help with the owner?');
    expect(greetingFor('brief', started).title).toBe('Want help with the AI brief?');
    expect(greetingFor('publish', started).title).toBe('Want help with publishing?');
  });
});
