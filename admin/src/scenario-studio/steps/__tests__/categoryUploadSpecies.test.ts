/**
 * Uploading a document "for a category": which animals it starts filed for.
 * A category covering dogs AND cats never decides for the admin — a dog-only
 * study defaulted to "every animal" would be read in cat scenarios.
 */
import { describe, expect, it } from 'vitest';
import { categorySpansBothAnimals, categoryUploadStartSpecies } from '../KnowledgeUpload';

const BOTH = { species: ['dog', 'puppy', 'cat'] };
const DOGS = { species: ['dog', 'puppy'] };
const CATS = { species: ['cat'] };

describe('category uploads — the document’s animals', () => {
  it('a one-animal category files the document for that animal', () => {
    expect(categorySpansBothAnimals(DOGS)).toBe(false);
    expect(categorySpansBothAnimals(CATS)).toBe(false);
    expect(categoryUploadStartSpecies(DOGS, null)).toEqual(['dog', 'puppy']);
    expect(categoryUploadStartSpecies(CATS, ['dog'])).toEqual(['cat']);
  });

  it('a category covering both starts EMPTY — the admin must choose', () => {
    expect(categorySpansBothAnimals(BOTH)).toBe(true);
    expect(categoryUploadStartSpecies(BOTH, null)).toEqual([]);
  });

  it('…or from the assistant’s reading of the document, kept inside the category', () => {
    expect(categoryUploadStartSpecies(BOTH, ['dog', 'puppy'])).toEqual(['dog', 'puppy']);
    expect(categoryUploadStartSpecies(BOTH, ['cat'])).toEqual(['cat']);
    expect(categoryUploadStartSpecies({ species: ['dog', 'cat'] }, ['puppy', 'cat'])).toEqual(['cat']);
  });

  it('no category is not a two-animal category', () => {
    expect(categorySpansBothAnimals(null)).toBe(false);
    expect(categorySpansBothAnimals(undefined)).toBe(false);
  });
});
