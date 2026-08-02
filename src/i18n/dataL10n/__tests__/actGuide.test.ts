import { describe, it, expect } from 'vitest';
import { ACT_STEPS } from '../../../data/knowledge/actGuide';
import { registerDataCatalog } from '../../dataRegistry';
import { actGuide as frActGuide } from '../../fr/data/actGuide';
import { localizedActStep } from '../actGuide';

registerDataCatalog('fr', { actGuide: frActGuide });

const LIST_FIELDS = ['techniques', 'doExamples', 'dontExamples'] as const;

describe('localizedActStep', () => {
  it('covers every ACT step in French', () => {
    expect(ACT_STEPS).toHaveLength(3);
    for (const step of ACT_STEPS) {
      const fr = localizedActStep(step, 'fr');
      expect(fr.label, `${step.key} label`).not.toBe(step.label);
      expect(fr.goal, `${step.key} goal`).not.toBe(step.goal);
      expect(fr.label.trim().length, `${step.key} label empty`).toBeGreaterThan(0);
      expect(fr.goal.trim().length, `${step.key} goal empty`).toBeGreaterThan(0);
    }
  });

  it('translates the step labels per the glossary', () => {
    const byKey = Object.fromEntries(
      ACT_STEPS.map((s) => [s.key, localizedActStep(s, 'fr').label]),
    );
    expect(byKey).toEqual({
      acknowledge: 'Reconnaître',
      clarify: 'Clarifier',
      takeAction: 'Transformer',
    });
  });

  it('keeps every example/technique list the same length, with no empty entries', () => {
    for (const step of ACT_STEPS) {
      const fr = localizedActStep(step, 'fr');
      for (const field of LIST_FIELDS) {
        expect(fr[field].length, `${step.key}.${field} length`).toBe(
          step[field].length,
        );
        fr[field].forEach((line, i) => {
          expect(line.trim().length, `${step.key}.${field}[${i}] empty`).toBeGreaterThan(0);
          expect(line, `${step.key}.${field}[${i}] untranslated`).not.toBe(
            step[field][i],
          );
        });
      }
    }
  });

  it('passes English through by identity (no overlay registered)', () => {
    for (const step of ACT_STEPS) {
      expect(localizedActStep(step, 'en')).toBe(step);
    }
  });

  it('localizes display fields only — the key is untouched', () => {
    for (const step of ACT_STEPS) {
      const fr = localizedActStep(step, 'fr');
      expect(fr.key, `${step.key} key`).toBe(step.key);
      expect(Object.keys(fr).sort()).toEqual(Object.keys(step).sort());
    }
  });

  it('never mutates the canonical step (prompt builders read it directly)', () => {
    const snapshot = JSON.parse(JSON.stringify(ACT_STEPS));
    ACT_STEPS.forEach((s) => localizedActStep(s, 'fr'));
    expect(ACT_STEPS).toEqual(snapshot);
  });

  it('keeps do-not-translate terms intact in the French copy', () => {
    const transform = localizedActStep(ACT_STEPS[2], 'fr');
    expect(transform.doExamples.join(' ')).toContain('Satiety Support');
    expect(transform.techniques.join(' ')).toMatch(/97/);
  });
});
