import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACTION_LABELS,
  DEVICE_LABELS,
  ENDED_REASON_LABELS,
  INSTALL_LABELS,
  LOCALE_LABELS,
  OS_LABELS,
  THEME_LABELS,
  labelOf,
} from '../labels';
import { DEVICE_CLASSES, OS_FAMILIES } from '../../../../src/lib/deviceContext';
import { LOCALES } from '../../../../src/i18n/locales';

/**
 * The label maps promise to be exhaustive against their sources (see the
 * header of ../labels.ts). These pin the ones whose source is code we can
 * read, so a new value can't reach the admin as a humanised raw key.
 */

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out = out.concat(walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sortedKeys = (m: Record<string, string>) => Object.keys(m).sort();

describe('admin labels — exhaustive against their sources', () => {
  it('ACTION_LABELS names every target the trainee app passes to logEvent()', () => {
    const targets = new Set<string>();
    for (const file of walk(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('logEvent(')) continue;
      for (const m of text.matchAll(/\btarget:\s*'([a-z_]+)'/g)) targets.add(m[1]);
    }
    expect(targets.has('app_open')).toBe(true);
    expect(targets.has('session_open')).toBe(true);
    const missing = [...targets].filter((t) => !(t in ACTION_LABELS));
    expect(missing).toEqual([]);
  });

  it('device / OS labels match the app_open vocabularies', () => {
    expect(sortedKeys(DEVICE_LABELS)).toEqual([...DEVICE_CLASSES].sort());
    expect(sortedKeys(OS_LABELS)).toEqual([...OS_FAMILIES].sort());
  });

  it('locale and theme labels match the app values', () => {
    expect(sortedKeys(LOCALE_LABELS)).toEqual([...LOCALES].sort());
    expect(sortedKeys(THEME_LABELS)).toEqual(['dark', 'light', 'system']);
  });

  it('install labels read a boolean meta.installed by its string form', () => {
    expect(labelOf(INSTALL_LABELS, String(true))).toBe('Installed app');
    expect(labelOf(INSTALL_LABELS, String(false))).toBe('In the browser');
  });

  it('ENDED_REASON_LABELS covers every reason a session is written with', () => {
    const src = readFileSync(join(process.cwd(), 'src/features/chat/useTextChat.ts'), 'utf8');
    const union = src.match(/endedReason:\s*((?:'[a-z_]+'\s*\|?\s*)+);/);
    expect(union).not.toBeNull();
    const reasons = [...union![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.filter((r) => !(r in ENDED_REASON_LABELS))).toEqual([]);
  });
});
