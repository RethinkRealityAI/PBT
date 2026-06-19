import { describe, expect, it } from 'vitest';
import {
  resolveDimensions,
  resolveWeights,
  resolveDriverKnowledge,
  resolvePushbackKnowledge,
  defaultSimulationConfig,
  type SimulationConfig,
} from '../simulationConfig';
import { DIMENSIONS } from '../scoringRubric';
import { DRIVER_KNOWLEDGE } from '../driverProfiles';

describe('resolveDimensions', () => {
  it('returns the code defaults when no config is supplied', () => {
    const dims = resolveDimensions();
    expect(dims.map((d) => d.key)).toEqual(DIMENSIONS.map((d) => d.key));
    expect(dims[0].weight).toBe(DIMENSIONS[0].weight);
    expect(dims[0].label).toBe(DIMENSIONS[0].label);
  });

  it('merges admin overrides by key and ignores unknown keys', () => {
    const config: SimulationConfig = {
      scoring: {
        dimensions: [
          { key: 'acknowledge', label: 'Validate first', weight: 0.5 },
          // @ts-expect-error — unknown key must be ignored
          { key: 'bogus', label: 'nope', weight: 99 },
        ],
      },
    };
    const dims = resolveDimensions(config);
    const ack = dims.find((d) => d.key === 'acknowledge')!;
    expect(ack.label).toBe('Validate first');
    expect(ack.weight).toBe(0.5);
    // Untouched dimension keeps its default.
    expect(dims.find((d) => d.key === 'clarify')!.label).toBe(
      DIMENSIONS.find((d) => d.key === 'clarify')!.label,
    );
    expect(dims).toHaveLength(DIMENSIONS.length);
  });
});

describe('resolveWeights', () => {
  it('defaults to the code weights (which sum to 1)', () => {
    const w = resolveWeights();
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(w.acknowledge).toBeCloseTo(0.24, 5);
  });

  it('normalises admin weights that do not sum to 1', () => {
    // All five set to 2 → each should normalise to 0.2.
    const config: SimulationConfig = {
      scoring: {
        dimensions: DIMENSIONS.map((d) => ({ key: d.key, weight: 2 })),
      },
    };
    const w = resolveWeights(config);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    for (const v of Object.values(w)) expect(v).toBeCloseTo(0.2, 5);
  });

  it('lets an admin zero-out a dimension and re-weights the rest', () => {
    const config: SimulationConfig = {
      scoring: {
        dimensions: [
          { key: 'acknowledge', weight: 1 },
          { key: 'clarify', weight: 1 },
          { key: 'transform', weight: 0 },
          { key: 'empathy', weight: 0 },
          { key: 'rapport', weight: 0 },
        ],
      },
    };
    const w = resolveWeights(config);
    expect(w.acknowledge).toBeCloseTo(0.5, 5);
    expect(w.clarify).toBeCloseTo(0.5, 5);
    expect(w.transform).toBe(0);
  });
});

describe('resolveDriverKnowledge', () => {
  it('returns the code default when no override', () => {
    expect(resolveDriverKnowledge('Activator')).toEqual(DRIVER_KNOWLEDGE.Activator);
  });

  it('merges only the provided fields, keeping the rest', () => {
    const config: SimulationConfig = {
      drivers: { Activator: { motivation: 'Speed above all.' } },
    };
    const d = resolveDriverKnowledge('Activator', config);
    expect(d.motivation).toBe('Speed above all.');
    // Arrays not overridden fall back to defaults.
    expect(d.customerSamplePhrasings).toEqual(
      DRIVER_KNOWLEDGE.Activator.customerSamplePhrasings,
    );
  });
});

describe('resolvePushbackKnowledge', () => {
  it('merges a code pushback with an override', () => {
    const config: SimulationConfig = {
      pushbacks: { cost: { title: 'Money worries' } },
    };
    const p = resolvePushbackKnowledge('cost', config)!;
    expect(p.title).toBe('Money worries');
    expect(p.rootConcerns.length).toBeGreaterThan(0); // kept from default
  });

  it('supports a brand-new admin-authored pushback with no code default', () => {
    const config: SimulationConfig = {
      pushbacks: {
        'vaccine-hesitancy': {
          title: 'Vaccine hesitancy',
          rootConcerns: ['Distrust of pharma'],
          acknowledgePatterns: ['Validate the worry'],
        },
      },
    };
    const p = resolvePushbackKnowledge('vaccine-hesitancy', config)!;
    expect(p.title).toBe('Vaccine hesitancy');
    expect(p.rootConcerns).toEqual(['Distrust of pharma']);
  });

  it('returns undefined for an unknown id with no config', () => {
    expect(resolvePushbackKnowledge('does-not-exist')).toBeUndefined();
  });
});

describe('defaultSimulationConfig', () => {
  it('serialises all five dimensions and four drivers for the editor', () => {
    const def = defaultSimulationConfig();
    expect(def.scoring.dimensions).toHaveLength(DIMENSIONS.length);
    expect(Object.keys(def.drivers)).toEqual(
      expect.arrayContaining(['Activator', 'Energizer', 'Analyzer', 'Harmonizer']),
    );
    expect(Object.keys(def.pushbacks).length).toBeGreaterThan(0);
  });
});
