import { describe, expect, it } from 'vitest';
import { chunkMarkdown, normalize, toPgvectorLiteral } from '../ragShared';

describe('chunkMarkdown', () => {
  it('packs paragraphs to the target and never splits mid-paragraph', () => {
    const para = 'word '.repeat(400).trim(); // ~500 tokens
    const text = [para, para, para].join('\n\n');
    const chunks = chunkMarkdown(text, 800, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk is made of whole paragraphs.
    for (const c of chunks) {
      for (const p of c.split('\n\n')) expect(para.startsWith(p.slice(0, 20))).toBe(true);
    }
  });

  it('seeds overlap from the previous chunk tail', () => {
    const p1 = 'alpha '.repeat(300).trim();
    const p2 = 'bravo '.repeat(300).trim();
    const p3 = 'charlie '.repeat(300).trim();
    const chunks = chunkMarkdown([p1, p2, p3].join('\n\n'), 500, 200);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The paragraph that closed chunk 1 reappears at the head of chunk 2.
    const tailOfFirst = chunks[0].split('\n\n').pop()!;
    expect(chunks[1].startsWith(tailOfFirst.slice(0, 30))).toBe(true);
  });

  it('handles empty input and single short paragraphs', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('just one line')).toEqual(['just one line']);
  });
});

describe('normalize', () => {
  it('produces a unit-length vector', () => {
    const v = normalize([3, 4]);
    expect(Math.hypot(...v)).toBeCloseTo(1, 6);
    expect(v[0]).toBeCloseTo(0.6, 6);
  });

  it('is safe on a zero vector', () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('toPgvectorLiteral', () => {
  it('serialises to the pgvector string form', () => {
    expect(toPgvectorLiteral([0.1, -0.2, 1])).toBe('[0.1,-0.2,1]');
  });
});
