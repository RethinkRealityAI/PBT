import { describe, expect, it } from 'vitest';
import {
  EXCELLENT_EXAMPLE_MAX,
  excellentExampleFor,
  sanitizeExcellentExamples,
} from '../types';

describe('excellentExampleFor', () => {
  it('returns the cleaned line for a dimension', () => {
    expect(excellentExampleFor({ excellentExamples: { clarify: '  "What matters most to you?" ' } }, 'clarify')).toBe(
      'What matters most to you?',
    );
  });

  it('is null for a missing, blank, placeholder or non-string line — never a generic fallback', () => {
    expect(excellentExampleFor(null, 'clarify')).toBeNull();
    expect(excellentExampleFor({}, 'clarify')).toBeNull();
    expect(excellentExampleFor({ excellentExamples: { clarify: '   ' } }, 'clarify')).toBeNull();
    expect(excellentExampleFor({ excellentExamples: { clarify: '—' } }, 'clarify')).toBeNull();
    expect(
      excellentExampleFor({ excellentExamples: { clarify: 42 as unknown as string } }, 'clarify'),
    ).toBeNull();
  });

  it('cuts a runaway answer', () => {
    const line = excellentExampleFor({ excellentExamples: { rapport: 'a'.repeat(1000) } }, 'rapport');
    expect(line).toHaveLength(EXCELLENT_EXAMPLE_MAX);
    expect(line?.endsWith('…')).toBe(true);
  });
});

describe('sanitizeExcellentExamples', () => {
  it('keeps only the five dimensions, as non-empty strings', () => {
    expect(
      sanitizeExcellentExamples({ acknowledge: 'A', clarify: '', bogus: 'x', rapport: 7 }),
    ).toEqual({ acknowledge: 'A' });
  });

  it('is undefined for nothing usable', () => {
    expect(sanitizeExcellentExamples(undefined)).toBeUndefined();
    expect(sanitizeExcellentExamples('line')).toBeUndefined();
    expect(sanitizeExcellentExamples(['a'])).toBeUndefined();
    expect(sanitizeExcellentExamples({ clarify: ' ' })).toBeUndefined();
  });
});
