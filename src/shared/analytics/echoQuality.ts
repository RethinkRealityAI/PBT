/**
 * ECHO quiz data quality — the ONE definition of "rushed", "straight-lined"
 * and "pattern match", and the metrics behind them. Used by the admin
 * portal's ECHO tab, the Skills tab's style matchup, the CSV export, the
 * offline mock and the tests.
 *
 * Computed at READ time from the stored answers, so the thresholds are a
 * live control in the portal, never baked into the database:
 *
 *   rushed          the median time per answer is below `fastMs` (2 s)
 *   straight-lined  one letter takes ≥ `sameLetterPct` (70 %) of the
 *                   answers, OR the longest run of the same letter in
 *                   question order is ≥ `runLength` (6)
 *   pattern match   a row WITHOUT answers (a profile backfill) whose tally is
 *                   exactly an all-same-letter fingerprint
 *                   (`ALL_SAME_LETTER_FINGERPRINTS`, computed from the quiz)
 *
 * The letter metrics use the 15 main questions in question order; the
 * tie-breaker (asked only on a tie) is kept apart. A share needs at least
 * `MIN_ANSWERS_FOR_SHARE` answers to count (a partial record of 3 answers
 * is not "100 % the same letter").
 *
 * An admin's review wins: `include` keeps a flagged quiz in, `exclude`
 * drops a clean one. Pure; unit-tested in `__tests__/echoQuality.test.ts`.
 */
import type { EchoQuizAnswer, EchoQuizRow } from './contract';
import { TIE_BREAKER_ID, fingerprintLetter, isQuizLetter, type QuizLetter } from '../quiz/echoScoring';

export interface EchoThresholds {
  /** An answer faster than this is "fast"; a median below it is rushed. */
  fastMs: number;
  /** Largest same-letter share (percent) at or above which a quiz is straight-lined. */
  sameLetterPct: number;
  /** Longest same-letter run at or above which a quiz is straight-lined. */
  runLength: number;
}

export const DEFAULT_ECHO_THRESHOLDS: Readonly<EchoThresholds> = Object.freeze({
  fastMs: 2000,
  sameLetterPct: 70,
  runLength: 6,
});

/** Bounds the portal's controls stay inside. */
export const ECHO_THRESHOLD_LIMITS = {
  fastMs: { min: 250, max: 10_000, step: 250 },
  sameLetterPct: { min: 30, max: 100, step: 5 },
  runLength: { min: 3, max: 15, step: 1 },
} as const;

export function clampThresholds(t: Partial<EchoThresholds>): EchoThresholds {
  const c = (v: unknown, k: keyof EchoThresholds) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAULT_ECHO_THRESHOLDS[k];
    return Math.max(ECHO_THRESHOLD_LIMITS[k].min, Math.min(ECHO_THRESHOLD_LIMITS[k].max, n));
  };
  return { fastMs: c(t.fastMs, 'fastMs'), sameLetterPct: c(t.sameLetterPct, 'sameLetterPct'), runLength: c(t.runLength, 'runLength') };
}

export const MIN_ANSWERS_FOR_SHARE = 8;

/** Keep only well-formed answers (the jsonb is trusted to be ours, but read defensively). */
export function parseEchoAnswers(raw: unknown): EchoQuizAnswer[] | null {
  if (!Array.isArray(raw)) return null;
  const out: EchoQuizAnswer[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const q = typeof r.q === 'number' ? r.q : Number.NaN;
    if (!Number.isInteger(q) || q < 1 || q > TIE_BREAKER_ID || !isQuizLetter(r.letter)) continue;
    const ms = typeof r.ms === 'number' && Number.isFinite(r.ms) ? Math.max(0, r.ms) : 0;
    out.push({ q, letter: r.letter, driver: typeof r.driver === 'string' ? r.driver : '', ms });
  }
  return out;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface EchoQuizMetrics {
  /** Main questions answered (0 for a backfilled profile). */
  answered: number;
  medianMs: number | null;
  /** Share (0–1) of answers faster than `fastMs`; null without answers. */
  fastShare: number | null;
  /** Largest same-letter share (0–1) and its letter; null without answers. */
  maxLetterShare: number | null;
  maxLetter: QuizLetter | null;
  /** Longest run of one letter in question order, and its letter. */
  longestRun: number;
  runLetter: QuizLetter | null;
  /** For rows without answers: the all-same letter the tally matches, if any. */
  fingerprint: QuizLetter | null;
}

/** The main answers in question order (tie-breaker excluded). */
export function mainAnswers(row: Pick<EchoQuizRow, 'answers'>): EchoQuizAnswer[] {
  return (row.answers ?? []).filter((a) => a.q !== TIE_BREAKER_ID).slice().sort((a, b) => a.q - b.q);
}

export function echoQuizMetrics(
  row: Pick<EchoQuizRow, 'answers' | 'tally'>,
  thresholds: EchoThresholds = DEFAULT_ECHO_THRESHOLDS,
): EchoQuizMetrics {
  const answers = row.answers ? mainAnswers(row) : null;
  if (!answers || answers.length === 0) {
    return {
      answered: 0,
      medianMs: null,
      fastShare: null,
      maxLetterShare: null,
      maxLetter: null,
      longestRun: 0,
      runLetter: null,
      fingerprint: row.answers == null ? fingerprintLetter(row.tally) : null,
    };
  }
  const times = answers.map((a) => a.ms);
  const counts = new Map<QuizLetter, number>();
  for (const a of answers) counts.set(a.letter, (counts.get(a.letter) ?? 0) + 1);
  let maxLetter: QuizLetter | null = null;
  let maxCount = 0;
  for (const l of ['A', 'B', 'C', 'D'] as const) {
    const n = counts.get(l) ?? 0;
    if (n > maxCount) {
      maxCount = n;
      maxLetter = l;
    }
  }
  let longestRun = 0;
  let runLetter: QuizLetter | null = null;
  let run = 0;
  for (let i = 0; i < answers.length; i++) {
    // A gap in question ids (a partial record) breaks a run.
    const continues = i > 0 && answers[i].letter === answers[i - 1].letter && answers[i].q === answers[i - 1].q + 1;
    run = continues ? run + 1 : 1;
    if (run > longestRun) {
      longestRun = run;
      runLetter = answers[i].letter;
    }
  }
  return {
    answered: answers.length,
    medianMs: median(times),
    fastShare: times.filter((t) => t < thresholds.fastMs).length / times.length,
    maxLetterShare: maxCount / answers.length,
    maxLetter,
    longestRun,
    runLetter,
    fingerprint: null,
  };
}

export interface EchoQuizFlags {
  rushed: boolean;
  straightLined: boolean;
  pattern: boolean;
}

export type EchoFlagKey = keyof EchoQuizFlags;

export const ECHO_FLAG_LABELS: Record<EchoFlagKey, string> = {
  rushed: 'Rushed',
  straightLined: 'Straight-lined',
  pattern: 'Pattern match',
};

export function echoQuizFlags(metrics: EchoQuizMetrics, thresholds: EchoThresholds = DEFAULT_ECHO_THRESHOLDS): EchoQuizFlags {
  const rushed = metrics.medianMs != null && metrics.medianMs < thresholds.fastMs;
  const shareFlag =
    metrics.answered >= MIN_ANSWERS_FOR_SHARE &&
    metrics.maxLetterShare != null &&
    metrics.maxLetterShare * 100 >= thresholds.sameLetterPct;
  const runFlag = metrics.longestRun >= thresholds.runLength;
  return { rushed, straightLined: shareFlag || runFlag, pattern: metrics.fingerprint != null };
}

export interface EchoQuizAssessment {
  metrics: EchoQuizMetrics;
  flags: EchoQuizFlags;
  /** Any automatic flag. */
  autoFlagged: boolean;
  /** An admin decided (include / exclude). */
  reviewed: boolean;
  /** Left out of ECHO analytics: excluded by review, or auto-flagged and not included. */
  excluded: boolean;
}

export function assessEchoQuiz(
  row: Pick<EchoQuizRow, 'answers' | 'tally' | 'review_status'>,
  thresholds: EchoThresholds = DEFAULT_ECHO_THRESHOLDS,
): EchoQuizAssessment {
  const metrics = echoQuizMetrics(row, thresholds);
  const flags = echoQuizFlags(metrics, thresholds);
  const autoFlagged = flags.rushed || flags.straightLined || flags.pattern;
  const reviewed = row.review_status === 'include' || row.review_status === 'exclude';
  const excluded = row.review_status === 'exclude' || (row.review_status !== 'include' && autoFlagged);
  return { metrics, flags, autoFlagged, reviewed, excluded };
}
