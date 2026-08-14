import { describe, it, expect } from 'vitest';
import { DIMENSIONS } from '../../../data/knowledge/scoringRubric';
import { resolveDimensions } from '../../../data/knowledge/simulationConfig';
import { registerDataCatalog } from '../../dataRegistry';
import { rubric as frRubric } from '../../fr/data/rubric';
import {
  localizedDimension,
  localizedDimensions,
  localizedResolvedDimension,
} from '../rubric';

/**
 * The overlay normally arrives via the lazy `import('./fr')` in
 * translate.ts#loadCatalog; tests register it directly so they don't depend on
 * catalog-loading order.
 */
registerDataCatalog('fr', { rubric: frRubric });

describe('localizedDimension', () => {
  it('translates every rubric dimension into French', () => {
    expect(DIMENSIONS).toHaveLength(5);
    for (const dim of DIMENSIONS) {
      const fr = localizedDimension(dim, 'fr');
      expect(fr.label, `${dim.key} label`).not.toBe(dim.label);
      expect(fr.description, `${dim.key} description`).not.toBe(dim.description);
      expect(fr.label.trim().length, `${dim.key} label empty`).toBeGreaterThan(0);
      expect(
        fr.description.trim().length,
        `${dim.key} description empty`,
      ).toBeGreaterThan(0);
      expect(
        fr.bands.excellent.example.trim().length,
        `${dim.key} excellent example empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('passes English through by identity (no overlay registered)', () => {
    for (const dim of DIMENSIONS) {
      expect(localizedDimension(dim, 'en')).toBe(dim);
    }
  });

  it('leaves the machine-facing fields untouched', () => {
    for (const dim of DIMENSIONS) {
      const fr = localizedDimension(dim, 'fr');
      expect(fr.key, `${dim.key} key`).toBe(dim.key);
      expect(fr.weight, `${dim.key} weight`).toBe(dim.weight);
      expect(fr.bands.excellent.min).toBe(dim.bands.excellent.min);
      // Prompt-only band prose is deliberately NOT translated — the scorer
      // reads the canonical English rubric whatever the app locale is.
      expect(fr.bands.solid).toEqual(dim.bands.solid);
      expect(fr.bands.developing).toEqual(dim.bands.developing);
      expect(fr.bands.needsWork).toEqual(dim.bands.needsWork);
    }
  });

  it('never mutates the canonical rubric', () => {
    const snapshot = JSON.parse(JSON.stringify(DIMENSIONS));
    localizedDimensions('fr');
    expect(JSON.parse(JSON.stringify(DIMENSIONS))).toEqual(snapshot);
  });

  it('keeps localizedDimensions in canonical order', () => {
    expect(localizedDimensions('fr').map((d) => d.key)).toEqual(
      DIMENSIONS.map((d) => d.key),
    );
  });
});

describe('localizedResolvedDimension', () => {
  it('translates dimensions the admin has not overridden', () => {
    for (const dim of resolveDimensions()) {
      const fr = localizedResolvedDimension(dim, 'fr');
      expect(fr.label, `${dim.key} label`).toBe(frRubric[dim.key].label);
      expect(fr.description, `${dim.key} description`).toBe(
        frRubric[dim.key].description,
      );
    }
  });

  it('leaves admin-authored overrides verbatim (unknown authoring language)', () => {
    const resolved = resolveDimensions({
      scoring: {
        dimensions: [
          { key: 'acknowledge', label: 'Écoute active', description: 'Texte admin' },
        ],
      },
    });
    const dim = resolved.find((d) => d.key === 'acknowledge')!;
    const fr = localizedResolvedDimension(dim, 'fr');
    expect(fr.label).toBe('Écoute active');
    expect(fr.description).toBe('Texte admin');
    // The untouched example still gets the translation.
    expect(fr.excellentExample).toBe(frRubric.acknowledge.excellentExample);
  });

  it('passes English through by identity', () => {
    for (const dim of resolveDimensions()) {
      expect(localizedResolvedDimension(dim, 'en')).toBe(dim);
    }
  });
});

describe('fr rubric overlay', () => {
  it('uses the fixed ACT translations and never re-labels a driver', () => {
    expect(frRubric.acknowledge.label).toBe('Reconnaître');
    expect(frRubric.clarify.label).toBe('Clarifier');
    expect(frRubric.transform.label).toBe('Transformer');
    // ECHO driver names are glossary terms — they must survive verbatim.
    expect(frRubric.rapport.excellentExample).toContain('Harmonizer');
    expect(frRubric.rapport.excellentExample).toContain('Activator');
  });

  it('leaks no untranslated English rubric vocabulary', () => {
    const english = /\b(staff member|the client's|clarifying|recommending|warmth|pacing)\b/i;
    const prose = Object.values(frRubric).flatMap((d) => [d.label, d.description]);
    for (const text of prose) {
      expect(english.test(text), `English leaked: ${text}`).toBe(false);
    }
  });
});
