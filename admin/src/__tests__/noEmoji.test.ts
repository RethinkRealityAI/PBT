/**
 * The admin draws pets (and every other pictogram) with the shared line
 * icons — `SpeciesBadge` / `SpeciesIcon` (src/design-system/SpeciesIcon.tsx)
 * and lucide — never colour emoji, which render differently on every
 * platform and read as unfinished in a client-facing tool. Typographic
 * glyphs (→ ✓ ✦ ✎ …) live outside the emoji planes and stay allowed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** Animals (U+1F400–U+1F43F, U+1F980–U+1F9AE) and the paw prints. */
const PET_EMOJI = /[\u{1F400}-\u{1F43F}\u{1F980}-\u{1F9AE}\u{1F43E}]/u;
/** The colour-emoji planes: pictographs, emoticons, transport, supplemental symbols. */
const COLOUR_EMOJI = /[\u{1F300}-\u{1FAFF}]/u;

function offenders(pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
  }
  return hits;
}

describe('no emoji in the admin', () => {
  it('scans real files', () => {
    expect(sourceFiles(ROOT).length).toBeGreaterThan(50);
  });

  it('draws no pet as an emoji', () => {
    expect(offenders(PET_EMOJI)).toEqual([]);
  });

  it('uses no colour emoji anywhere (lucide icons instead)', () => {
    expect(offenders(COLOUR_EMOJI)).toEqual([]);
  });
});
