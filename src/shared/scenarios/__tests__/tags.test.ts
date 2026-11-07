import { describe, expect, it } from 'vitest';
import {
  TAG_COLORS,
  TAG_COLOR_KEYS,
  TAG_LIMITS,
  contrastRatio,
  isTaggableScenarioId,
  isTagColor,
  nextTagColor,
  normalizeTagName,
  rowToScenarioTag,
  sortTags,
  tagNameKey,
  tagNameProblem,
  validateTagInput,
} from '../tags';

describe('tag palette', () => {
  it('has 8–10 named colours, each defined once', () => {
    expect(TAG_COLOR_KEYS.length).toBeGreaterThanOrEqual(8);
    expect(TAG_COLOR_KEYS.length).toBeLessThanOrEqual(10);
    expect(new Set(TAG_COLOR_KEYS).size).toBe(TAG_COLOR_KEYS.length);
    expect(Object.keys(TAG_COLORS).sort()).toEqual([...TAG_COLOR_KEYS].sort());
    for (const key of TAG_COLOR_KEYS) {
      expect(TAG_COLORS[key].key).toBe(key);
      expect(TAG_COLORS[key].label.trim()).not.toBe('');
    }
  });

  it.each(TAG_COLOR_KEYS)('%s pill text passes WCAG AA in light and dark', (key) => {
    const { light, dark } = TAG_COLORS[key];
    expect(contrastRatio(light.fg, light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.fg, dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes contrast the WCAG way', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });

  it('only accepts palette keys — never a free hex', () => {
    expect(isTagColor('teal')).toBe(true);
    expect(isTagColor('#ff0000')).toBe(false);
    expect(isTagColor('Teal')).toBe(false);
    expect(isTagColor(null)).toBe(false);
  });
});

describe('tag names', () => {
  it('normalises spaces and compares case-insensitively', () => {
    expect(normalizeTagName('  Q1   rollout ')).toBe('Q1 rollout');
    expect(tagNameKey('Q1  Rollout')).toBe(tagNameKey('q1 rollout'));
  });

  it('says what is wrong with a name', () => {
    expect(tagNameProblem('')).toBe('Give the tag a name.');
    expect(tagNameProblem('   ')).toBe('Give the tag a name.');
    expect(tagNameProblem(42)).toBe('Give the tag a name.');
    expect(tagNameProblem('x'.repeat(TAG_LIMITS.nameMax))).toBeNull();
    expect(tagNameProblem('x'.repeat(TAG_LIMITS.nameMax + 1))).toMatch(/32 characters/);
  });

  it('validates an upsert body', () => {
    expect(validateTagInput({ name: 'Q1', color: 'teal' })).toBeNull();
    expect(validateTagInput({ id: '3f6c2a1e-8b7d-4c5e-9a10-2b3c4d5e6f70', name: 'Q1', color: 'teal' })).toBeNull();
    expect(validateTagInput({ name: 'Q1', color: '#00ff00' })).toBe('Pick one of the palette colours.');
    expect(validateTagInput({ id: 'nope', name: 'Q1', color: 'teal' })).toBe('Unknown tag.');
    expect(validateTagInput(null)).toBe('tag required');
    expect(validateTagInput(['Q1'])).toBe('tag required');
  });
});

describe('nextTagColor', () => {
  it('takes the first unused colour, then spreads repeats evenly', () => {
    expect(nextTagColor([])).toBe(TAG_COLOR_KEYS[0]);
    expect(nextTagColor([TAG_COLOR_KEYS[0]])).toBe(TAG_COLOR_KEYS[1]);
    const all = [...TAG_COLOR_KEYS];
    expect(nextTagColor(all)).toBe(TAG_COLOR_KEYS[0]);
    expect(nextTagColor([...all, TAG_COLOR_KEYS[0]])).toBe(TAG_COLOR_KEYS[1]);
  });
});

describe('scenario ids and rows', () => {
  it('tags library and Studio scenarios, never a trainee’s own', () => {
    expect(isTaggableScenarioId('seed:1')).toBe(true);
    expect(isTaggableScenarioId('admin:3f6c2a1e-8b7d-4c5e-9a10-2b3c4d5e6f70')).toBe(true);
    expect(isTaggableScenarioId('user:3f6c2a1e-8b7d-4c5e-9a10-2b3c4d5e6f70')).toBe(false);
    expect(isTaggableScenarioId('admin:')).toBe(false);
    expect(isTaggableScenarioId(`admin:${'x'.repeat(90)}`)).toBe(false);
  });

  it('reads stored rows tolerantly and sorts A→Z', () => {
    const a = rowToScenarioTag({ id: '00000000-0000-4000-8000-000000000002', name: ' beta ', color: 'nope', updated_at: 't' });
    expect(a).toEqual({ id: '00000000-0000-4000-8000-000000000002', name: 'beta', color: 'slate', updatedAt: 't' });
    expect(rowToScenarioTag({ id: 'x', name: 'a', color: 'teal' })).toBeNull();
    expect(rowToScenarioTag(null)).toBeNull();
    const b = { id: '00000000-0000-4000-8000-000000000001', name: 'Alpha', color: 'teal' as const, updatedAt: null };
    expect(sortTags([a!, b]).map((t) => t.name)).toEqual(['Alpha', 'beta']);
  });
});
