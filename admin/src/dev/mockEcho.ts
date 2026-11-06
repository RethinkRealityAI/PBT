/**
 * Offline fixtures for Analytics → ECHO (`npm run dev:admin-mock`).
 *
 * Every quiz is generated as LETTERS and timings, then scored with the same
 * shared rule the server uses (`src/shared/quiz/echoScoring.ts`) and tagged
 * with the same device hashes (`src/shared/analytics/device.ts`), so the
 * tab's flags (computed by `echoQuality.ts` at read time) behave exactly as
 * they would on production rows. The seed includes a workshop that was told
 * to "just click A" (12 anonymous devices, all-A in under a second each),
 * a few straight-liners, signed-in retakes, backfilled profiles (one of them
 * matching the all-A fingerprint) and an admin who tested the quiz.
 */
import type { EchoQuizAnswer, EchoQuizRow, EchoReport, EchoReviewStatus, TraineeDirectoryEntry } from '../../../src/shared/analytics/contract';
import { QUIZ_QUESTIONS } from '../../../src/data/quizQuestions';
import {
  ALL_SAME_LETTER_FINGERPRINTS,
  QUIZ_LETTERS,
  TIE_BREAKER_ID,
  driverFor,
  rankTally,
  scoreLetters,
  topTwoTie,
  tallyOf,
  type QuizLetter,
} from '../../../src/shared/quiz/echoScoring';
import { deviceKey, deviceTag } from '../../../src/shared/analytics/device';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEchoRows(
  people: readonly TraineeDirectoryEntry[],
  devices: readonly { id: string; locale: string }[],
  now: number,
): EchoQuizRow[] {
  const rand = rng(20261106);
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rand() * l.length)];
  let n = 0;
  const qid = () => `ec000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  const quiz = (
    owner: { user_id: string | null; anon?: string | null },
    at: number,
    letterOf: (i: number) => QuizLetter,
    msOf: (i: number) => number,
    locale: string | null,
  ): EchoQuizRow => {
    const answers: EchoQuizAnswer[] = QUIZ_QUESTIONS.map((q, i) => {
      const letter = letterOf(i);
      return { q: q.id, letter, driver: driverFor(q.id, letter) ?? '', ms: Math.round(msOf(i)) };
    });
    let tie: EchoQuizAnswer | null = null;
    if (topTwoTie(tallyOf(answers.map((a) => a.driver as never)))) {
      const l = pick(QUIZ_LETTERS);
      tie = { q: TIE_BREAKER_ID, letter: l, driver: driverFor(TIE_BREAKER_ID, l) ?? '', ms: Math.round(msOf(15)) };
    }
    const s = scoreLetters(new Map(answers.map((a) => [a.q, a.letter])), tie?.letter ?? null);
    const total = answers.reduce((t, a) => t + a.ms, 0) + (tie?.ms ?? 0) + 420 * (answers.length + (tie ? 1 : 0));
    return {
      id: qid(),
      user_id: owner.user_id,
      device: owner.anon ? deviceTag(owner.anon) : null,
      device_key: owner.anon ? deviceKey(owner.anon) : null,
      source: 'app',
      created_at: new Date(at).toISOString(),
      taken_at: new Date(at - 2000).toISOString(),
      locale,
      answers,
      tie_breaker: tie,
      primary_driver: s.primary,
      secondary_driver: s.secondary,
      tally: s.tally,
      total_ms: total,
      undo_count: rand() < 0.2 ? 1 + Math.floor(rand() * 3) : 0,
      review_status: 'auto',
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    };
  };

  const thoughtful = () => (i: number) => {
    // Mostly varied letters, with a lean (people have a style).
    void i;
    return pick(['A', 'B', 'C', 'D', pick(QUIZ_LETTERS)] as QuizLetter[]);
  };
  const thinkMs = () => 2500 + rand() * 9000;

  const rows: EchoQuizRow[] = [];

  // Signed-in trainees: a backfilled profile each (from before recording), and
  // a recorded retake for about half of them.
  people.forEach((p, i) => {
    const created = new Date(p.created_at).getTime();
    const backTally =
      i === 3
        ? { ...ALL_SAME_LETTER_FINGERPRINTS[0].tally } // looks like "all A"
        : tallyOf(QUIZ_QUESTIONS.map((q) => driverFor(q.id, pick(QUIZ_LETTERS)) as never));
    const ranked = rankTally(backTally);
    rows.push({
      id: qid(),
      user_id: p.user_id,
      device: null,
      device_key: null,
      source: 'profile_backfill',
      created_at: new Date(Math.min(created, now - 12 * DAY)).toISOString(),
      taken_at: new Date(Math.min(created, now - 12 * DAY)).toISOString(),
      locale: null,
      answers: null,
      tie_breaker: null,
      primary_driver: ranked.primary,
      secondary_driver: ranked.secondary,
      tally: ranked.tally,
      total_ms: null,
      undo_count: null,
      review_status: 'auto',
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    });
    if (i % 2 === 0) rows.push(quiz({ user_id: p.user_id }, now - rand() * 10 * DAY, thoughtful(), thinkMs, p.locale));
  });

  // Portal staff testing the quiz: all D, fast.
  const staff = people.find((p) => p.admin_role);
  if (staff) rows.push(quiz({ user_id: staff.user_id }, now - 2 * DAY, () => 'D', () => 700 + rand() * 400, 'en'));

  // Anonymous devices: most thoughtful…
  devices.slice(12).forEach((d) => rows.push(quiz({ user_id: null, anon: d.id }, now - rand() * 9 * DAY, thoughtful(), thinkMs, d.locale)));
  // …a workshop told to "just click A" (12 devices, 4 days ago, same hour)…
  devices.slice(0, 12).forEach((d) =>
    rows.push(quiz({ user_id: null, anon: d.id }, now - 4 * DAY + rand() * HOUR, () => 'A', () => 350 + rand() * 500, d.locale)),
  );
  // …and a few straight-liners who weren't rushing (a run of B, then mixed).
  for (let i = 0; i < 4; i++) {
    const d = pick(devices.slice(12));
    rows.push(quiz({ user_id: null, anon: d.id }, now - rand() * 6 * DAY, (k) => (k < 9 ? 'B' : pick(QUIZ_LETTERS)), thinkMs, d.locale));
  }

  // One workshop quiz an admin already reviewed.
  const reviewed = rows.find((r) => r.source === 'app' && r.answers?.every((a) => a.letter === 'A'));
  if (reviewed) {
    reviewed.review_status = 'exclude';
    reviewed.review_note = 'Workshop: told to click A to get in';
    reviewed.reviewed_at = new Date(now - 3 * DAY).toISOString();
  }
  return rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

let state: EchoQuizRow[] | null = null;

export function echoReport(people: readonly TraineeDirectoryEntry[], devices: readonly { id: string; locale: string }[], now: number): EchoReport {
  state ??= buildEchoRows(people, devices, now);
  const app = state.filter((r) => r.source === 'app').map((r) => r.created_at).sort();
  return {
    rows: state,
    truncated: false,
    recording_since: app[0] ?? null,
    history: { before: app[0] ?? new Date(now).toISOString(), visits: 286, under_30s: 105 },
    can_review: true,
  };
}

export function echoReviewMock(body: Record<string, unknown>): unknown {
  const row = state?.find((r) => r.id === body.id);
  if (!row) return { error: 'Quiz not found' };
  const status = body.status as EchoReviewStatus;
  row.review_status = status;
  row.review_note = status === 'auto' ? null : typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  row.reviewed_at = new Date().toISOString();
  return { row };
}
