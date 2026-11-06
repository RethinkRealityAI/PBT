// @vitest-environment node
/**
 * `scripts/feline/build.py` on a SYNTHETIC page (no Royal Canin text): a
 * heading, prose, a canine-only passage, and a feeding table with a two-level
 * header. Pins the accuracy rules: one labelled statement per row (every
 * value carries its column headers), the canine passage removed and recorded,
 * the page marker, the manifest pins — and the BLOCKING fidelity check: a
 * value that is not in the page's text layer becomes an open review note and
 * the document is held (not approved).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const hasPython = spawnSync('python3', ['--version']).status === 0;
const BUILD = path.resolve(__dirname, '../build.py');

type W = [number, number, number, number, string];
/** Words of one line starting at x, 5 pt per character + 3 pt spaces. */
function line(text: string, x: number, y: number, h = 10): W[] {
  const out: W[] = [];
  for (const word of text.split(' ')) {
    const w = word.length * 5;
    out.push([x, y, x + w, y + h, word]);
    x += w + 3;
  }
  return out;
}

function page(layoutExtra = '') {
  const words: W[] = [
    ...line('MADE-UP', 50, 40, 22),
    ...line('Placeholder prose about an invented diet for cats.', 50, 80),
    ...line('Dogs only: an invented canine passage here.', 50, 120),
    // Table: two-level header, then two rows.
    ...line('Body Weight', 300, 160), ...line('Daily Amount', 420, 160),
    ...line('lb', 300, 175), ...line('kg', 340, 175), ...line('Cups', 400, 175), ...line('Grams', 460, 175),
    ...line('4.4', 300, 190), ...line('2', 340, 190), ...line('1/4', 400, 190), ...line('26', 460, 190),
    ...line('5.5', 300, 205), ...line('2.5', 340, 205), ...line('3/8', 400, 205), ...line('33', 460, 205),
  ];
  const ln = (text: string, x: number, y: number, h = 10) => ({ text, bbox: [x, y, x + text.length * 5, y + h], h });
  return {
    n: 1,
    width: 600,
    height: 800,
    bodyH: 10,
    rotatedWords: 0,
    layoutText:
      'MADE-UP\nPlaceholder prose about an invented diet for cats.\nDogs only: an invented canine passage here.\n' +
      'Body Weight Daily Amount\nlb kg Cups Grams\n4.4 2 1/4 26\n5.5 2.5 3/8 ' + layoutExtra + '\n',
    blocks: [
      { kind: 'text', bbox: [50, 40, 300, 50], lines: [ln('MADE-UP', 50, 40, 22)] },
      { kind: 'text', bbox: [50, 80, 400, 90], lines: [ln('Placeholder prose about an invented diet for cats.', 50, 80)] },
      { kind: 'text', bbox: [50, 120, 400, 130], lines: [ln('Dogs only: an invented canine passage here.', 50, 120)] },
      {
        kind: 'table',
        bbox: [300, 160, 500, 215],
        lines: [ln('Body Weight Daily Amount', 300, 160), ln('lb kg Cups Grams', 300, 175), ln('4.4 2 1/4 26', 300, 190), ln('5.5 2.5 3/8 33', 300, 205)],
      },
    ],
    words,
  };
}

function run(layoutExtra: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'feline-build-'));
  mkdirSync(path.join(dir, 'pages'));
  writeFileSync(
    path.join(dir, 'pages', '42.json'),
    JSON.stringify({ sourceId: '42', name: 'synthetic.pdf', folder: '', kind: 'pdf', sha256: 'b'.repeat(64), size: 1, pages: [page(layoutExtra)] }),
  );
  const manifest = {
    corpus: 'feline',
    permission: { status: 'pending', reference: '', grantedBy: '', date: '' },
    publish: false,
    excluded: [],
    documents: [
      {
        slug: 'synthetic', approved: true, title: 'Synthetic', sourceId: '42', assetType: 'detailer', edition: '', region: 'CA',
        audience: 'vet', focus: null, species: ['cat'], tools: ['scoring', 'coach', 'scenario-builder'], pages: [1],
        pagesExcluded: [], transcribedPages: [], reviewNotes: [], reason: 'test', reviewedBy: 'test', reviewedAt: '2026-11-04',
      },
    ],
  };
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  execFileSync('python3', ['-I', BUILD, '--pages', path.join(dir, 'pages'), '--out', path.join(dir, 'out'), '--manifest', path.join(dir, 'manifest.json')], { stdio: 'pipe' });
  return {
    row: JSON.parse(readFileSync(path.join(dir, 'out', 'synthetic.json'), 'utf8')),
    doc: JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')).documents[0],
  };
}

describe.skipIf(!hasPython)('feline build.py (synthetic page)', () => {
  it('writes labelled table statements, drops the canine passage and pins the result', () => {
    const { row, doc } = run('33');
    const md: string = row.content;
    expect(md.startsWith('<!-- page 1 -->')).toBe(true);
    expect(md).toContain('## MADE-UP');
    expect(md).toContain('Placeholder prose about an invented diet for cats.');
    expect(md).not.toContain('canine passage');
    expect(md).toContain('- Body Weight: 4.4 lb, 2 kg — Daily Amount: 1/4 Cups, 26 Grams');
    expect(md).toContain('- Body Weight: 5.5 lb, 2.5 kg — Daily Amount: 3/8 Cups, 33 Grams');
    expect(doc.canineBlocksRemoved).toEqual([{ page: 1, words: 7 }]);
    expect(doc.contentHash).toBe(createHash('sha256').update(md, 'utf8').digest('hex'));
    expect(doc.sourceHash).toBe('b'.repeat(64));
    expect(doc.reviewNotes).toEqual([]);
    expect(doc.approved).toBe(true);
    expect(row.meta).not.toHaveProperty('sourceUrl');
  });

  it('holds the document when a value is not in the page text layer (fidelity check)', () => {
    const { doc } = run('');
    expect(doc.reviewNotes).toContainEqual({ page: 1, token: '33', status: 'open' });
    expect(doc.approved).toBe(false);
    expect(doc.reason).toMatch(/held: open fidelity review notes/);
  });
});
