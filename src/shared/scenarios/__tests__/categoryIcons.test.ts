import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_CATEGORY_ICON,
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  DEFAULT_CATEGORY_ICON,
  categoryIconFor,
  guessCategoryIcon,
  isCategoryIconKey,
} from '../categoryIcons';
import {
  BUILT_IN_CATEGORIES,
  categoryToRow,
  rowToCategory,
  validateCategoryInput,
} from '../objectionCategories';
import { CATEGORY_ICON_GLYPHS } from '../../../design-system/CategoryIcon';

describe('category icon vocabulary', () => {
  it('has 16 keys, each with a label and a drawing', () => {
    expect(CATEGORY_ICON_KEYS).toHaveLength(16);
    expect(new Set(CATEGORY_ICON_KEYS).size).toBe(16);
    for (const k of CATEGORY_ICON_KEYS) {
      expect(CATEGORY_ICON_LABELS[k]).toBeTruthy();
      expect(CATEGORY_ICON_GLYPHS[k]).toBeTruthy();
    }
  });

  it('every built-in category has a fixed icon from the vocabulary', () => {
    for (const c of BUILT_IN_CATEGORIES) expect(isCategoryIconKey(BUILT_IN_CATEGORY_ICON[c.id])).toBe(true);
  });

  it('the migration CHECK allows exactly the vocabulary', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261107000100_category_icons.sql'),
      'utf8',
    );
    const list = sql.match(/icon in \(([\s\S]*?)\)/)?.[1] ?? '';
    const keys = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(keys.sort()).toEqual([...CATEGORY_ICON_KEYS].sort());
  });
});

describe('guessCategoryIcon — the keyword heuristic', () => {
  it.each([
    ['Urinary health', 'droplet'],
    ['Struvite crystals', 'droplet'],
    ['Renal care', 'kidney'],
    ['Kidney disease', 'kidney'],
    ['GI', 'sprout'],
    ['Probiotics', 'sprout'],
    ['Digestive health', 'sprout'],
    ['Obesity & weight loss', 'scale'],
    ['Cost of food', 'coins'],
    ['Skin & coat', 'shield'],
    ['Allergies', 'shield'],
    ['Heart health', 'heart'],
    ['Joint mobility', 'bone'],
    ['Senior pets', 'clock'],
    ['Supplements', 'pill'],
    ['Therapeutic diets', 'stethoscope'],
    ['Breeder advice', 'users'],
    ['Raw feeding', 'bowl'],
    ['Diet trends', 'bowl'],
    ['Brand loyalty', 'sparkles'],
  ])('%s → %s', (name, icon) => {
    expect(guessCategoryIcon({ name })).toBe(icon);
  });

  it('reads French names (accents ignored)', () => {
    expect(guessCategoryIcon({ name: 'Santé urinaire' })).toBe('droplet');
    expect(guessCategoryIcon({ name: 'Soins rénaux' })).toBe('kidney');
    expect(guessCategoryIcon({ name: 'Gestion du poids' })).toBe('scale');
    expect(guessCategoryIcon({ name: 'Cœur' })).toBe('heart');
  });

  it('prefers the name, then the French name, then the description', () => {
    expect(guessCategoryIcon({ name: 'Weight', description: 'urinary' })).toBe('scale');
    expect(guessCategoryIcon({ name: 'Zzz', nameFr: 'Santé urinaire', description: 'weight' })).toBe('droplet');
    expect(guessCategoryIcon({ name: 'Zzz', description: 'Owners worried about kidney values.' })).toBe('kidney');
  });

  it('falls back to the tag, and never matches inside a word', () => {
    expect(guessCategoryIcon({ name: 'Miscellaneous' })).toBe(DEFAULT_CATEGORY_ICON);
    expect(guessCategoryIcon({ name: '' })).toBe('tag');
    // "gi" only as a whole word: "Giving up" is not GI.
    expect(guessCategoryIcon({ name: 'Giving up' })).toBe('tag');
  });
});

describe('categoryIconFor', () => {
  it('built-ins keep their fixed icon whatever is stored', () => {
    expect(categoryIconFor({ id: 'weight', icon: 'heart', name: 'Kidney' })).toBe('scale');
    expect(categoryIconFor({ id: 'everyday-nutrition' })).toBe('bowl');
    expect(categoryIconFor({ id: 'prescription-diets' })).toBe('stethoscope');
  });

  it('a team category uses the admin’s choice, else the guess', () => {
    expect(categoryIconFor({ id: 'category:x', icon: 'heart', name: 'Urinary' })).toBe('heart');
    expect(categoryIconFor({ id: 'category:x', icon: 'nope', name: 'Urinary' })).toBe('droplet');
    expect(categoryIconFor({ id: 'category:x', icon: null, name: 'Probiotics' })).toBe('sprout');
  });
});

describe('icon on the stored category', () => {
  const base = { id: 'category:gi', name: 'GI' };

  it('rowToCategory carries a valid team icon, drops anything else', () => {
    expect(rowToCategory({ ...base, icon: 'sprout' })?.icon).toBe('sprout');
    expect(rowToCategory({ ...base, icon: 'rocket' })).not.toHaveProperty('icon');
    expect(rowToCategory({ ...base })).not.toHaveProperty('icon');
    expect(rowToCategory({ id: 'weight', name: 'Weight', icon: 'heart' })).not.toHaveProperty('icon');
  });

  it('validateCategoryInput accepts a vocabulary key, null to clear, and refuses anything else', () => {
    expect(validateCategoryInput({ ...base, icon: 'kidney' }).value?.icon).toBe('kidney');
    expect(validateCategoryInput({ ...base, icon: null }).value?.icon).toBeNull();
    const omitted = validateCategoryInput(base);
    expect(omitted.ok).toBe(true);
    expect(omitted.value).not.toHaveProperty('icon');
    const bad = validateCategoryInput({ ...base, icon: '🦴' });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/icon/);
  });

  it('categoryToRow writes the icon only when the write names it, never for a built-in', () => {
    const named = validateCategoryInput({ ...base, icon: 'kidney' }).value!;
    expect(categoryToRow(named).icon).toBe('kidney');
    const cleared = validateCategoryInput({ ...base, icon: null }).value!;
    expect(categoryToRow(cleared)).toHaveProperty('icon', null);
    expect(categoryToRow(validateCategoryInput(base).value!)).not.toHaveProperty('icon');
    const builtIn = validateCategoryInput({ id: 'weight', name: 'Weight', icon: 'heart' }).value!;
    expect(categoryToRow(builtIn)).not.toHaveProperty('icon');
  });
});
