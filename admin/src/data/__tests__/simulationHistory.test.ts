import { describe, it, expect } from 'vitest';
import {
  configEquals,
  countCustomisations,
  isDefaultConfig,
  resetConsequences,
  summarizeConfigDelta,
} from '../simulationHistory';

describe('summarizeConfigDelta', () => {
  it('returns nothing for identical configs', () => {
    const cfg = { scoring: { promptPrefix: 'x' }, rag: { enabled: true, k: 4 } };
    expect(summarizeConfigDelta(cfg, { ...cfg })).toEqual([]);
  });

  it('treats null / undefined / empty as the same empty config', () => {
    expect(summarizeConfigDelta(null, undefined)).toEqual([]);
    expect(summarizeConfigDelta({}, null)).toEqual([]);
  });

  it('names the scoring section when a dimension weight changes', () => {
    const before = { scoring: { dimensions: [{ key: 'acknowledge', weight: 0.2 }] } };
    const after = { scoring: { dimensions: [{ key: 'acknowledge', weight: 0.3 }] } };
    expect(summarizeConfigDelta(before, after)).toEqual(['Scoring']);
  });

  it('groups both customer prompt wraps under one label', () => {
    const before = { customerPromptPrefix: 'a', customerPromptSuffix: 'b' };
    const after = { customerPromptPrefix: 'A', customerPromptSuffix: 'B' };
    expect(summarizeConfigDelta(before, after)).toEqual(['Customer prompt']);
  });

  it('detects a key being added and a key being removed', () => {
    expect(summarizeConfigDelta({}, { drivers: { Activator: { motivation: 'x' } } })).toEqual([
      'Drivers',
    ]);
    expect(summarizeConfigDelta({ pushbacks: { cost: { id: 'cost' } } }, {})).toEqual([
      'Pushbacks',
    ]);
  });

  it('reports several sections in a stable section order', () => {
    const before = { scoring: { promptPrefix: 'a' }, rag: { enabled: true, k: 4 } };
    const after = {
      scoring: { promptPrefix: 'b' },
      pushbacks: { cost: { id: 'cost' } },
      rag: { enabled: false, k: 4 },
    };
    expect(summarizeConfigDelta(before, after)).toEqual(['Scoring', 'Pushbacks', 'Retrieval']);
  });

  it('ignores key order inside nested objects', () => {
    const before = { rag: { enabled: true, k: 4 } };
    const after = { rag: { k: 4, enabled: true } };
    expect(summarizeConfigDelta(before, after)).toEqual([]);
  });

  it('is sensitive to array order', () => {
    const before = { drivers: { Activator: { strengths: ['a', 'b'] } } };
    const after = { drivers: { Activator: { strengths: ['b', 'a'] } } };
    expect(summarizeConfigDelta(before, after)).toEqual(['Drivers']);
  });

  it('surfaces unknown top-level keys under their own name, sorted', () => {
    const before = {};
    const after = { zeta: 1, alpha: 2 };
    expect(summarizeConfigDelta(before, after)).toEqual(['alpha', 'zeta']);
  });
});

describe('configEquals', () => {
  it('is key-order insensitive and null-tolerant', () => {
    expect(configEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(configEquals(null, {})).toBe(true);
    expect(configEquals({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('countCustomisations', () => {
  it('counts each layer of a minimal config', () => {
    const n = countCustomisations({
      scoring: {
        dimensions: [{ key: 'acknowledge' }, { key: 'clarify' }],
        promptPrefix: 'be kind',
      },
      drivers: { Activator: { motivation: 'x' } },
      pushbacks: { cost: { id: 'cost' }, 'my-new-one': { id: 'my-new-one' } },
      customerPromptSuffix: 'stay in character',
      rag: { enabled: false, k: 4 },
    });
    expect(n).toEqual({
      dimensions: 2,
      drivers: 1,
      pushbacks: 2,
      prompts: 2,
      retrieval: 1,
    });
  });

  it('treats blank prompt strings as not customised', () => {
    expect(countCustomisations({ customerPromptPrefix: '   ' }).prompts).toBe(0);
  });

  it('is zero for an empty or missing config', () => {
    expect(countCustomisations({})).toEqual({
      dimensions: 0,
      drivers: 0,
      pushbacks: 0,
      prompts: 0,
      retrieval: 0,
    });
    expect(countCustomisations(null).drivers).toBe(0);
  });
});

describe('isDefaultConfig', () => {
  it('treats an empty/absent config as the defaults — it carries only diffs', () => {
    expect(isDefaultConfig({})).toBe(true);
    expect(isDefaultConfig(null)).toBe(true);
    expect(isDefaultConfig(undefined)).toBe(true);
    expect(isDefaultConfig({ drivers: {} })).toBe(false);
  });
});

describe('resetConsequences', () => {
  it('names each thing that would be lost, with counts', () => {
    const out = resetConsequences({
      scoring: { dimensions: [{ key: 'acknowledge' }] },
      drivers: { Activator: {}, Analyzer: {} },
      pushbacks: { 'my-new-one': { id: 'my-new-one' } },
    });
    expect(out.some((c) => c.startsWith('1 scoring dimension '))).toBe(true);
    expect(out.some((c) => c.startsWith('2 driver personas'))).toBe(true);
    expect(out.some((c) => c.includes('category you added here disappears'))).toBe(true);
  });

  it('admits when nothing is customised rather than implying loss', () => {
    const out = resetConsequences({});
    expect(out[0]).toMatch(/Nothing is customised/);
  });

  it('always ends by saying the reset is not itself a save', () => {
    expect(resetConsequences({ drivers: { Activator: {} } }).at(-1)).toMatch(
      /Nothing is written until/,
    );
  });
});
