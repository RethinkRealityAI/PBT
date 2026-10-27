import { describe, expect, it } from 'vitest';
import { chunkMarkdown, chunkSectionedMarkdown, normalize, sectionCitation, toPgvectorLiteral } from '../ragShared';

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

describe('chunkSectionedMarkdown (Royal Canin Academy articles)', () => {
  const md = [
    '> The stand-first.',
    '',
    '## Key points',
    '',
    '- One\n- Two',
    '',
    '## Diet',
    '',
    '### Fibre',
    '',
    'Fibre paragraph.',
    '',
    'Second diet paragraph.',
    '',
    '## Empty section',
    '',
    '## References',
    '',
    '1. Smith J. A paper. 2020.',
  ].join('\n');

  it('splits at ## headings and prefixes every chunk with "Title — Section"', () => {
    const chunks = chunkSectionedMarkdown('My article', md);
    expect(chunks.map((c) => c.section)).toEqual(['Overview', 'Key points', 'Diet']);
    expect(chunks[0].content).toBe('My article — Overview\n\n> The stand-first.');
    expect(chunks[2].content).toBe('My article — Diet\n\n### Fibre\n\nFibre paragraph.\n\nSecond diet paragraph.');
  });

  it('never embeds the references and drops sections with no text', () => {
    const chunks = chunkSectionedMarkdown('T', md);
    expect(chunks.some((c) => /Smith J/.test(c.content))).toBe(false);
    expect(chunks.some((c) => c.section === 'Empty section')).toBe(false);
  });

  it('packs paragraphs to the target without crossing a section, and splits an oversize unit by line', () => {
    const para = 'x'.repeat(400); // ~100 tokens
    const long = Array.from({ length: 12 }, () => para).join('\n\n');
    const chunks = chunkSectionedMarkdown('T', `## A\n\n${long}\n\n## B\n\nshort`, 250);
    const a = chunks.filter((c) => c.section === 'A');
    expect(a.length).toBe(6); // two ~100-token paragraphs per 250-token chunk
    expect(chunks[chunks.length - 1]).toEqual({ section: 'B', content: 'T — B\n\nshort' });
    const table = Array.from({ length: 30 }, (_, i) => `| row ${i} | ${'y'.repeat(60)} |`).join('\n');
    const split = chunkSectionedMarkdown('T', `## Tab\n\n${table}`, 200);
    expect(split.length).toBeGreaterThan(1);
    expect(split.map((c) => c.content.replace('T — Tab\n\n', '')).join('\n')).toBe(table);
  });

  it('sectionCitation appends the section, and stays null without a citation', () => {
    expect(sectionCitation('Graham KM. Pet obesity.', 'Getting started')).toBe('Graham KM. Pet obesity. — "Getting started"');
    expect(sectionCitation(null, 'X')).toBeNull();
  });
});
