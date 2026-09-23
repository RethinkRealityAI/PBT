/**
 * Fecal Scan — prompts + result normaliser.
 *
 * The normaliser is where the grounding guarantee is enforced in code: a
 * score the retrieved passages never mentioned is pulled back onto an allowed
 * score and its confidence capped, and the band is always re-derived from the
 * chart rather than trusted from the model.
 */
import { describe, expect, it } from 'vitest';
import {
  DISAGREEMENT_CONFIDENCE_CAP,
  EXACT_REFERENCE_CONFIDENCE,
  FECAL_CHART_PASSAGE_LABEL,
  FECAL_SUPPLEMENT_PASSAGE_LABEL,
  exactReferenceNote,
  visualDisagreementNote,
  FECAL_OBSERVE_SYSTEM_INSTRUCTION,
  buildFecalScoreSystemInstruction,
  normalizeFecalScanResult,
  observationsToQuery,
  type FecalObservations,
  type FecalScorePassage,
} from '../fecalScan';
import { buildFecalChartMarkdown, fecalEntryParagraph, FECAL_CHARTS } from '../../../data/knowledge/fecalCharts';

const OBS: FecalObservations = {
  form: 'distinct cylindrical shape',
  moisture: 'moist',
  surface: 'no visible cracks',
  residue: 'would leave some residue',
  homogeneity: 'homogeneous throughout',
};

const dogParagraph = (score: number) =>
  fecalEntryParagraph('dog', FECAL_CHARTS.dog.entries.find((e) => e.score === score)!);

const chart = (text: string): FecalScorePassage => ({ kind: 'chart', text });

describe('FECAL_OBSERVE_SYSTEM_INSTRUCTION', () => {
  it('asks for neutral observation only — no scoring, no diagnosis', () => {
    const s = FECAL_OBSERVE_SYSTEM_INSTRUCTION;
    for (const field of ['form', 'moisture', 'surface', 'residue', 'homogeneity', 'notVisible']) {
      expect(s).toContain(field);
    }
    expect(s).toContain('isStool');
    expect(s).toMatch(/do not (?:score|assign)/i);
    expect(s).toMatch(/diagnos/i);
    // The observer must never see the chart — that is stage 2's job.
    expect(s).not.toContain('REFERENCE PASSAGES');
    expect(s).not.toMatch(/Score 3\.5/);
  });
});

describe('buildFecalScoreSystemInstruction', () => {
  const passages = [chart(dogParagraph(3)), chart(dogParagraph(3.5))];

  it('includes the chart directions and the passages verbatim under REFERENCE PASSAGES', () => {
    const s = buildFecalScoreSystemInstruction('dog', null, passages, 'en');
    expect(s).toContain('REFERENCE PASSAGES');
    for (const p of passages) expect(s).toContain(p.text);
    expect(s).toContain(FECAL_CHARTS.dog.directions);
    expect(s).toContain(FECAL_CHARTS.dog.title);
    // The passages section must come after the rules, and the rules must bind
    // the model to the passages.
    expect(s).toMatch(/only .*scores? .*(appear|present)/i);
    expect(s).toMatch(/nearest/i);
    expect(s).toMatch(/lower(?:ing)? the confidence|lower your confidence/i);
    expect(s).toMatch(/never invent/i);
  });

  it('tells the scorer to compare the photo against the chart reference photos', () => {
    const s = buildFecalScoreSystemInstruction('dog', null, passages, 'en');
    expect(s).toContain('REFERENCE PHOTOS');
    expect(s).toContain('PHOTO TO SCORE');
    expect(s).toMatch(/reference photo AND passage/);
    // DELIBERATE change: the old "near-identical → confidence ≥ 0.95" line is
    // gone (the model is not a reliable judge of "near-identical"; the
    // deterministic exact-reference check is). Confidence must be calibrated
    // and ambiguity between neighbouring scores must lower it.
    expect(s).not.toMatch(/0\.95/);
    expect(s).toMatch(/CALIBRATED/);
    expect(s).toMatch(/Ambiguity between\s+neighbouring scores MUST lower it/);
    // The label-confusion fix: pick the numbered photo first, and read the
    // label that belongs to THAT photo.
    expect(s).toMatch(/mostSimilarReference/);
    expect(s).toMatch(/0 if none/);
    expect(s).toMatch(/never the score of a neighbouring reference/);
  });

  it('states the non-diagnostic, non-commercial posture and a generic caution', () => {
    const s = buildFecalScoreSystemInstruction('cat', null, [chart(dogParagraph(1))], 'en');
    expect(s).toMatch(/not a diagnosis/i);
    expect(s).toMatch(/no (?:product|brand)|do not (?:name|recommend)/i);
    expect(s).toContain('involve the veterinarian if');
  });

  it('carries the puppy breed size, which decides the score-3 band', () => {
    const withSize = buildFecalScoreSystemInstruction('puppy', 'large-giant', [], 'en');
    expect(withSize).toContain('large-giant');
    const without = buildFecalScoreSystemInstruction('puppy', null, [], 'en');
    expect(without).not.toContain('large-giant');
  });

  it('adds the Canadian French output addendum and leaves enums/numbers untranslated', () => {
    const en = buildFecalScoreSystemInstruction('dog', null, passages, 'en');
    const fr = buildFecalScoreSystemInstruction('dog', null, passages, 'fr');
    expect(en).not.toMatch(/CANADIAN FRENCH/i);
    expect(fr).toMatch(/CANADIAN FRENCH/i);
    expect(fr).toMatch(/Do NOT translate/i);
    // The chart passages stay verbatim in both.
    for (const p of passages) expect(fr).toContain(p.text);
    // The scorer hands the (English) observations back in French, and owns
    // notVisible — the function takes both from it for a French caller.
    expect(fr).toMatch(/observations: restate the observations/);
    expect(fr).toMatch(/notVisible: every item, including the ones already noted, in French/);
  });

  it('falls back to the bundled chart wording when given no passages', () => {
    const s = buildFecalScoreSystemInstruction('dog', null, [chart(buildFecalChartMarkdown('dog'))], 'en');
    expect(s).toContain('Score 2.5');
    expect(s).toContain('CLEARLY DEFINED SHAPE WITH VISIBLE CRACKS');
  });

  it('labels every passage by authority — the chart decides, a supplement never does', () => {
    const supplement: FecalScorePassage = {
      kind: 'supplement',
      text: 'Photograph the sample in daylight.',
      source: 'Clinic photo tips',
    };
    const s = buildFecalScoreSystemInstruction('dog', null, [...passages, supplement], 'en');
    const section = s.slice(s.indexOf('# REFERENCE PASSAGES'));
    expect(FECAL_CHART_PASSAGE_LABEL).toBe('ROYAL CANIN CHART');
    expect(FECAL_SUPPLEMENT_PASSAGE_LABEL).toBe(
      'CLINIC SUPPLEMENT (lower authority — the chart decides)',
    );
    // Each chart passage is directly preceded by its label…
    for (const p of passages) expect(section).toContain(`[ROYAL CANIN CHART]\n${p.text}`);
    // …and the supplement by its own, naming its source.
    expect(section).toContain(
      '[CLINIC SUPPLEMENT (lower authority — the chart decides) — Clinic photo tips]\nPhotograph the sample in daylight.',
    );
    // The rules bind the SCORE to chart passages only.
    expect(s).toMatch(/Choose ONLY a score that appears in the ROYAL CANIN CHART passages/);
    expect(s).toMatch(/can\s+never add a score/);
  });
});

describe('rationale annotations', () => {
  it('names the matched score, in the caller locale', () => {
    expect(exactReferenceNote(3.5, 'en')).toBe(
      "Matches the chart's own reference photo for Score 3.5.",
    );
    expect(exactReferenceNote(3.5, 'fr')).toContain('score 3.5');
    expect(exactReferenceNote(3.5, 'fr')).toMatch(/référence/);
  });

  it('spells out a visual-vs-wording split both ways round', () => {
    expect(visualDisagreementNote(4, 3.5, 'en')).toBe(
      'The visual match pointed to Score 4; the chart wording pointed to Score 3.5.',
    );
    expect(visualDisagreementNote(4, 3.5, 'fr')).toMatch(/score 4.+score 3\.5/);
  });

  it('caps disagreement below the exact-match floor', () => {
    expect(DISAGREEMENT_CONFIDENCE_CAP).toBeLessThan(EXACT_REFERENCE_CONFIDENCE);
  });
});

describe('observationsToQuery', () => {
  it('joins the five observation fields into one bounded string', () => {
    const q = observationsToQuery(OBS);
    for (const v of Object.values(OBS)) expect(q).toContain(v);
    expect(q.length).toBeLessThanOrEqual(400);
  });

  it('skips empty fields and clamps a runaway model to 400 chars', () => {
    const q = observationsToQuery({ ...OBS, surface: '   ', residue: '' });
    expect(q).not.toContain(';;');
    expect(q).toContain('moist');
    const long = observationsToQuery({
      form: 'x'.repeat(500),
      moisture: 'y'.repeat(500),
      surface: '',
      residue: '',
      homogeneity: '',
    });
    expect(long.length).toBe(400);
  });
});

describe('normalizeFecalScanResult', () => {
  const opts = { species: 'dog' as const, allowedScores: [3, 3.5], locale: 'en' as const };

  it('snaps the score onto the chart and derives the band from it', () => {
    const out = normalizeFecalScanResult(
      { score: 3.4, band: 'optimal', confidence: 0.8, observations: OBS },
      { species: 'dog', allowedScores: [3, 3.5], locale: 'en' },
    );
    expect(out.score).toBe(3.5);
    // The model said "optimal"; the chart says 3.5 is too soft.
    expect(out.band).toBe('tooSoft');
    expect(out.confidence).toBe(0.8);
    expect(out.species).toBe('dog');
  });

  it('never trusts the model band for a puppy — breed size decides score 3', () => {
    const big = normalizeFecalScanResult(
      { score: 3, band: 'tooHard' },
      { species: 'puppy', breedSize: 'large-giant', allowedScores: [3], locale: 'en' },
    );
    expect(big.band).toBe('normal');
    const small = normalizeFecalScanResult(
      { score: 3, band: 'normal' },
      { species: 'puppy', breedSize: 'small-medium', allowedScores: [3], locale: 'en' },
    );
    expect(small.band).toBe('tooSoft');
    const unknown = normalizeFecalScanResult(
      { score: 3 },
      { species: 'puppy', allowedScores: [3], locale: 'en' },
    );
    expect(unknown.band).toBe('tooSoft');
  });

  it('coerces a score the passages never mentioned and caps the confidence at 0.4', () => {
    const out = normalizeFecalScanResult(
      { score: 1, confidence: 0.99 },
      { species: 'dog', allowedScores: [3.5], locale: 'en' },
    );
    expect(out.score).toBe(3.5);
    expect(out.confidence).toBeLessThanOrEqual(0.4);
    expect(out.band).toBe('tooSoft');
  });

  it('keeps an already-low confidence when coercing rather than raising it', () => {
    const out = normalizeFecalScanResult(
      { score: 1, confidence: 0.1 },
      { species: 'dog', allowedScores: [3.5], locale: 'en' },
    );
    expect(out.confidence).toBeCloseTo(0.1);
  });

  it('does not coerce when no passage scores are known (empty allowedScores)', () => {
    const out = normalizeFecalScanResult(
      { score: 1, confidence: 0.9 },
      { species: 'dog', allowedScores: [], locale: 'en' },
    );
    expect(out.score).toBe(1);
    expect(out.confidence).toBe(0.9);
  });

  it('clamps confidence into 0–1 and defaults a missing score onto the chart', () => {
    const high = normalizeFecalScanResult({ score: 3, confidence: 4 }, opts);
    expect(high.confidence).toBe(1);
    const low = normalizeFecalScanResult({ score: 3, confidence: -2 }, opts);
    expect(low.confidence).toBe(0);
    const missing = normalizeFecalScanResult({}, { ...opts, allowedScores: [] });
    expect(FECAL_CHARTS.dog.entries.map((e) => e.score)).toContain(missing.score);
  });

  it('never lets a defaulted (missing / non-numeric) score keep the model confidence', () => {
    for (const score of [undefined, Number.NaN, '3.5', null, Infinity]) {
      const out = normalizeFecalScanResult(
        { score, confidence: 0.93 },
        { ...opts, allowedScores: [] },
      );
      expect(out.confidence).toBe(0);
    }
  });

  it('filters alternates to chart scores, drops the main score, and keeps at most two', () => {
    const out = normalizeFecalScanResult(
      {
        score: 3.5,
        alternates: [
          { score: 3, confidence: 0.3 },
          { score: 3.5, confidence: 0.2 },
          { score: 7, confidence: 0.2 },
          { score: 4, confidence: 2 },
          { score: 3, confidence: 0.1 },
          { score: 4.5, confidence: 0.1 },
        ],
      },
      { ...opts, allowedScores: [] },
    );
    expect(out.alternates).toHaveLength(2);
    expect(out.alternates.map((a) => a.score)).toEqual([3, 4]);
    expect(out.alternates[1].confidence).toBe(1);
  });

  it('trims strings, defaults them by locale, and coerces the array fields', () => {
    const en = normalizeFecalScanResult(
      {
        score: 3,
        rationale: '  moist, cracks still visible  ',
        caution: '   ',
        observations: { ...OBS, surface: '  smooth  ', moisture: '' },
        notVisible: ['odour', 42, 'volume'],
      },
      opts,
    );
    expect(en.rationale).toBe('moist, cracks still visible');
    expect(en.observations.surface).toBe('smooth');
    expect(en.observations.moisture).toBeTruthy();
    expect(en.caution).toMatch(/veterinarian/i);
    expect(en.notVisible).toEqual(['odour', 'volume']);

    const fr = normalizeFecalScanResult({ score: 3 }, { ...opts, locale: 'fr' });
    expect(fr.caution).toMatch(/vétérinaire/i);
    expect(fr.observations.form).not.toBe(en.observations.form);
  });

  it('treats isStool as true unless the model explicitly said false', () => {
    expect(normalizeFecalScanResult({}, opts).isStool).toBe(true);
    expect(normalizeFecalScanResult({ isStool: false }, opts).isStool).toBe(false);
    expect(normalizeFecalScanResult(null, opts).isStool).toBe(true);
    expect(normalizeFecalScanResult(undefined, opts).alternates).toEqual([]);
  });

  it('ignores allowedScores the chosen chart does not define', () => {
    // 3.5 is not on the cat chart — it must not become a coercion target.
    const out = normalizeFecalScanResult(
      { score: 1, confidence: 0.9 },
      { species: 'cat', allowedScores: [3.5], locale: 'en' },
    );
    expect(out.score).toBe(1);
    expect(out.confidence).toBe(0.9);
  });
});
