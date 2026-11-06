import { describe, expect, it } from 'vitest';
import type { EchoQuizAnswer, EchoQuizRow } from '../../../../../src/shared/analytics/contract';
import { DEFAULT_ECHO_THRESHOLDS } from '../../../../../src/shared/analytics/echoQuality';
import { ALL_SAME_LETTER_FINGERPRINTS, driverFor, type QuizLetter } from '../../../../../src/shared/quiz/echoScoring';
import { QUIZ_QUESTIONS } from '../../../../../src/data/quizQuestions';
import { deviceKey } from '../../../../../src/shared/analytics/device';
import { session, anonSession } from './fixtures';
import {
  DEFAULT_ECHO_OPTIONS,
  NO_ECHO_FILTERS,
  assessAll,
  driverMatrix,
  echoAnswersCsv,
  echoKpis,
  echoQuizCsv,
  exclusionCounts,
  filterEcho,
  inPopulation,
  isCounted,
  primaryCounts,
  questionDiagnostics,
  traineeStyleResolver,
  type EchoOptions,
} from '../echo';
import { toCsv } from '../csv';

const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const CYCLE: QuizLetter[] = ['A', 'B', 'C', 'D'];
let n = 0;

function answers(letterOf: (i: number) => QuizLetter, ms = 4000): EchoQuizAnswer[] {
  return QUIZ_QUESTIONS.map((q, i) => ({ q: q.id, letter: letterOf(i), driver: driverFor(q.id, letterOf(i)) ?? '', ms }));
}

function quiz(over: Partial<EchoQuizRow> = {}): EchoQuizRow {
  n += 1;
  return {
    id: `q${n}`,
    user_id: 'u1',
    device: null,
    device_key: null,
    source: 'app',
    created_at: new Date(NOW - 60_000 * n).toISOString(),
    taken_at: null,
    locale: 'en',
    answers: answers((i) => CYCLE[i % 4]),
    tie_breaker: null,
    primary_driver: 'Analyzer',
    secondary_driver: 'Harmonizer',
    tally: { Analyzer: 4, Harmonizer: 4, Energizer: 4, Activator: 3 },
    total_ms: 60_000,
    undo_count: 0,
    review_status: 'auto',
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    ...over,
  };
}

const staffDir = (id: string) => (id === 'admin' ? { user_id: id, admin_role: 'admin', display_name: 'Ada', email: null } : { user_id: id, admin_role: null, display_name: `=cmd|${id}`, email: null });

function opts(over: Partial<EchoOptions> = {}): EchoOptions {
  return { ...DEFAULT_ECHO_OPTIONS, ...over };
}

describe('ECHO population and counting', () => {
  const rows = [
    quiz(),
    quiz({ answers: answers(() => 'A', 500), primary_driver: 'Analyzer' }), // flagged
    quiz({ user_id: 'admin' }), // staff
    quiz({ source: 'profile_backfill', answers: null, total_ms: null, tally: ALL_SAME_LETTER_FINGERPRINTS[0].tally }), // pattern
    quiz({ source: 'profile_backfill', answers: null, total_ms: null, tally: { Activator: 9, Energizer: 3, Analyzer: 2, Harmonizer: 1 }, primary_driver: 'Activator' }),
    quiz({ answers: answers(() => 'B', 400), review_status: 'include', primary_driver: 'Activator' }), // flagged but included
    quiz({ review_status: 'exclude' }), // clean but excluded
    quiz({ user_id: null, device: '4F2A', device_key: 'k1', primary_driver: 'Energizer' }),
  ];
  const views = assessAll(rows, DEFAULT_ECHO_THRESHOLDS, staffDir);

  it('leaves out flagged, admin-excluded and staff quizzes by default — and says why', () => {
    const counted = views.filter((v) => isCounted(v, opts()));
    expect(counted.map((v) => v.row.id)).toEqual([rows[0].id, rows[4].id, rows[5].id, rows[7].id]);
    expect(exclusionCounts(views, opts())).toEqual({ reviewed: 1, flagged: 2, staff: 1, backfill: 0, total: 4 });
  });

  it('honours each toggle, but an admin Exclude always wins', () => {
    expect(views.filter((v) => isCounted(v, opts({ includeFlagged: true }))).map((v) => v.row.id)).not.toContain(rows[6].id);
    expect(views.filter((v) => isCounted(v, opts({ includeFlagged: true }))).length).toBe(6);
    expect(views.filter((v) => inPopulation(v, opts({ includeStaff: true }))).length).toBe(8);
    expect(views.filter((v) => inPopulation(v, opts({ includeBackfill: false }))).length).toBe(5);
  });

  it('counts people and devices apart, and the flag rate over the population', () => {
    const k = echoKpis(views.filter((v) => inPopulation(v, opts())));
    expect(k.completed).toBe(7);
    expect(k.people).toBe(1);
    expect(k.devices).toBe(1);
    expect(k.flagged).toBe(3);
    expect(k.rushed).toBe(2);
    expect(k.pattern).toBe(1);
    expect(k.flaggedPct).toBeCloseTo((3 / 7) * 100);
    // Backfilled rows carry no timings.
    expect(k.medianTotalMs).toBe(60_000);
  });

  it('filters by who, style, flag state, source and staff', () => {
    const f = (patch: Partial<typeof NO_ECHO_FILTERS>, q = '') => filterEcho(views, { ...NO_ECHO_FILTERS, ...patch }, q, staffDir).length;
    expect(f({ who: 'anonymous' })).toBe(1);
    expect(f({ primary: 'Activator' })).toBe(2);
    expect(f({ flag: 'flagged' })).toBe(3);
    expect(f({ flag: 'rushed' })).toBe(2);
    expect(f({ flag: 'pattern' })).toBe(1);
    expect(f({ flag: 'reviewed' })).toBe(2);
    expect(f({ flag: 'clean' })).toBe(5);
    expect(f({ source: 'profile_backfill' })).toBe(2);
    expect(f({ staff: 'staff' })).toBe(1);
    expect(f({}, 'device 4f2a')).toBe(1);
  });

  it('draws distributions from counted quizzes only', () => {
    const counted = views.filter((v) => isCounted(v, opts()));
    expect(primaryCounts(counted)).toEqual({ Activator: 2, Energizer: 1, Analyzer: 1, Harmonizer: 0 });
    expect(driverMatrix(counted).get('Activator|Harmonizer')).toBe(2);
  });

  it('diagnoses questions from recorded answers', () => {
    const d = questionDiagnostics(views, DEFAULT_ECHO_THRESHOLDS);
    expect(d).toHaveLength(15);
    // q1: rows with answers = 6 (backfills have none); all-A, all-B and four cycling (A on q1).
    expect(d[0].answered).toBe(6);
    expect(d[0].share.A).toBeCloseTo(5 / 6);
    expect(d[0].fastShare).toBeCloseTo(2 / 6);
  });
});

describe('ECHO CSV', () => {
  const views = assessAll(
    [quiz({ user_id: 'u9' }), quiz({ user_id: null, device: '4F2A', device_key: 'secret-key' })],
    DEFAULT_ECHO_THRESHOLDS,
    staffDir,
  );

  it('one row per quiz, formula-safe, never a device key', () => {
    const { header, rows } = echoQuizCsv(views, { nameOf: (id) => `=cmd|${id}`, options: opts() });
    expect(rows).toHaveLength(2);
    const csv = toCsv(header, rows);
    expect(csv).toContain("'=cmd|u9");
    expect(csv).toContain('Anonymous · Device 4F2A');
    expect(csv).not.toContain('secret-key');
    expect(header).toContain('Counted in ECHO analytics');
  });

  it('one row per answer (long format), tie-breaker included', () => {
    const tb = assessAll([quiz({ tie_breaker: { q: 16, letter: 'A', driver: 'Activator', ms: 900 } })], DEFAULT_ECHO_THRESHOLDS, staffDir);
    const { rows } = echoAnswersCsv([...views, ...tb], { nameOf: () => 'X', options: opts() });
    expect(rows).toHaveLength(15 * 3 + 1);
    expect(rows.at(-1)?.[4]).toBe('Tie-breaker');
  });
});

describe('traineeStyleResolver (Skills matchup)', () => {
  const quizzes = [
    quiz({ user_id: 'u1', primary_driver: 'Harmonizer', created_at: '2026-11-01T00:00:00.000Z' }),
    // u1's LATEST quiz is a straight-lined one → style unknown by default.
    quiz({ user_id: 'u1', primary_driver: 'Analyzer', answers: answers(() => 'A', 300), created_at: '2026-11-05T00:00:00.000Z' }),
    quiz({ user_id: null, device_key: deviceKey('dev-1'), primary_driver: 'Energizer' }),
  ];

  it("uses the latest quiz, hides a flagged one unless included, and joins devices", () => {
    const r = traineeStyleResolver(quizzes, { thresholds: DEFAULT_ECHO_THRESHOLDS, includeFlagged: false, fallback: () => 'Activator' });
    expect(r(session({ user_id: 'u1' }))).toEqual({ driver: null, excluded: true });
    expect(r(anonSession('dev-1'))).toEqual({ driver: 'Energizer', excluded: false });
    expect(r(anonSession('dev-2'))).toEqual({ driver: null, excluded: false });
    // No quiz row → the profile's stored style.
    expect(r(session({ user_id: 'u5' }))).toEqual({ driver: 'Activator', excluded: false });
    const incl = traineeStyleResolver(quizzes, { thresholds: DEFAULT_ECHO_THRESHOLDS, includeFlagged: true });
    expect(incl(session({ user_id: 'u1' }))).toEqual({ driver: 'Analyzer', excluded: false });
  });
});
