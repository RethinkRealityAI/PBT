// @vitest-environment node
/**
 * `echo-quiz-save` — ECHO quiz recording (drivers derived on the server) and
 * the sign-in claim. Supabase is the chainable fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type TableHandler } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import save, { ECHO_MAX_ANSWER_MS, ECHO_QUIZ_DAILY_CAP, parseQuiz } from '../echo-quiz-save';
import { __resetRateLimits } from '../_shared/ai';
import { RATE_LIMITS } from '../_shared/rateLimits';
import { QUIZ_QUESTIONS } from '../../../src/data/quizQuestions';
import { letterFor, TIE_BREAKER_ID, type QuizLetter } from '../../../src/shared/quiz/echoScoring';

const QUIZ = '0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d';
const DEVICE = '7f3e2d1c-0b9a-4876-8543-210fedcba987';

let sb: FakeSupabase;

const allLetter = (l: QuizLetter, ms = 3000) => QUIZ_QUESTIONS.map((q) => ({ questionId: q.id, letter: l, ms }));

function body(extra: Record<string, unknown> = {}) {
  return { quizId: QUIZ, anonSessionId: DEVICE, answers: allLetter('B'), tieBreaker: null, undoCount: 2, totalMs: 45_000, locale: 'fr', ...extra };
}

function quizTable({ recent = 0, exists = false }: { recent?: number; exists?: boolean } = {}): TableHandler {
  return (call) => {
    const first = call.ops[0];
    if (first.op === 'select' && (first.args[1] as { count?: string } | undefined)?.count) return { data: null, count: recent, error: null };
    if (first.op === 'upsert') return { data: exists ? [] : [{ id: QUIZ }], error: null };
    if (first.op === 'update') return { data: [{ id: QUIZ }], error: null };
    return { data: null, error: null };
  };
}

function signIn(userId = 'user-1') {
  sb.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  sb.setHandler('profiles', () => ({ data: { disabled: false }, error: null }));
  return { authorization: 'Bearer good-token' };
}

function insertedRow(): Record<string, unknown> {
  const call = sb.callsFor('echo_quiz_results').find((c) => c.ops[0].op === 'upsert');
  return call?.ops[0].args[0] as Record<string, unknown>;
}

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('echo-quiz-save · record', () => {
  it('records an anonymous quiz owned by the device, drivers derived from the letters', async () => {
    sb.setHandler('echo_quiz_results', quizTable());
    // A forged tally/primary in the body is ignored.
    const res = await save(jsonRequest('echo-quiz-save', body({ tally: { Harmonizer: 15 }, primary: 'Harmonizer' })));
    expect(await res.json()).toEqual({ persisted: true });
    const calls = sb.callsFor('echo_quiz_results');
    expect(calls[0].ops).toEqual([
      { op: 'select', args: ['id', { count: 'exact', head: true }] },
      { op: 'gte', args: ['created_at', expect.any(String)] },
      { op: 'eq', args: ['anon_session_id', DEVICE] },
    ]);
    expect(calls[1].ops[0].args[1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    const row = insertedRow();
    expect(row).toMatchObject({
      id: QUIZ,
      user_id: null,
      anon_session_id: DEVICE,
      source: 'app',
      locale: 'fr',
      primary_driver: 'Activator',
      tally: { Activator: 8, Energizer: 3, Analyzer: 2, Harmonizer: 2 },
      total_ms: 45_000,
      undo_count: 2,
      tie_breaker: null,
    });
    expect(row).not.toHaveProperty('created_at');
    const answers = row.answers as Array<{ q: number; letter: string; driver: string; ms: number }>;
    expect(answers).toHaveLength(15);
    expect(answers[0]).toEqual({ q: 1, letter: 'B', driver: 'Activator', ms: 3000 });
  });

  it('owns a signed-in quiz by the verified account, never the body', async () => {
    sb.setHandler('echo_quiz_results', quizTable());
    const res = await save(jsonRequest('echo-quiz-save', body(), { headers: signIn('user-9') }));
    expect(await res.json()).toEqual({ persisted: true });
    expect(insertedRow()).toMatchObject({ user_id: 'user-9', anon_session_id: null });
  });

  it('writes nothing with the opt-out or in a preview', async () => {
    for (const [extra, skipped] of [
      [{ allowTelemetry: false }, 'opted_out'],
      [{ preview: true }, 'preview'],
    ] as const) {
      const res = await save(jsonRequest('echo-quiz-save', body(extra)));
      expect(await res.json()).toEqual({ persisted: false, skipped });
    }
    expect(sb.callsFor('echo_quiz_results')).toHaveLength(0);
  });

  it('validates strictly', async () => {
    const bad = [
      body({ quizId: 'nope' }),
      body({ anonSessionId: 'x' }),
      body({ answers: allLetter('A').slice(0, 14) }),
      body({ answers: [...allLetter('A'), { questionId: 1, letter: 'A', ms: 1 }] }),
      body({ answers: allLetter('A').map((a, i) => (i === 3 ? { ...a, letter: 'E' } : a)) }),
      body({ answers: allLetter('A').map((a, i) => (i === 3 ? { ...a, questionId: 99 } : a)) }),
      body({ answers: allLetter('A').map((a, i) => (i === 3 ? { ...a, ms: 'fast' } : a)) }),
      body({ answers: Array.from({ length: 17 }, () => ({ questionId: 1, letter: 'A', ms: 1 })) }),
      body({ answers: 'A' }),
    ];
    for (const b of bad) {
      const res = await save(jsonRequest('echo-quiz-save', b));
      expect(res.status).toBe(400);
    }
    expect(sb.callsFor('echo_quiz_results')).toHaveLength(0);
    const huge = await save(jsonRequest('echo-quiz-save', body({ pad: 'x'.repeat(20_000) })));
    expect(huge.status).toBe(413);
  });

  it('clamps times and keeps the tie-breaker only on a real tie', () => {
    const slow = parseQuiz(body({ answers: allLetter('A', 99_999_999), totalMs: -5 }) as never);
    if (slow.ok !== true) throw new Error('expected ok');
    expect(slow.answers[0].ms).toBe(ECHO_MAX_ANSWER_MS);
    expect(slow.totalMs).toBe(0);
    expect(parseQuiz(body({ tieBreaker: { letter: 'D', ms: 100 } }) as never)).toMatchObject({ tieBreaker: null });

    // 7 Activator / 7 Energizer / 1 Analyzer ties → the tie-breaker counts.
    const tied = QUIZ_QUESTIONS.map((q, i) => ({
      questionId: q.id,
      letter: letterFor(q.id, i < 7 ? 'Activator' : i < 14 ? 'Energizer' : 'Analyzer') as QuizLetter,
      ms: 2000,
    }));
    const tb = letterFor(TIE_BREAKER_ID, 'Energizer') as QuizLetter;
    const r = parseQuiz(body({ answers: tied, tieBreaker: { letter: tb, ms: 900 } }) as never);
    expect(r).toMatchObject({ primary: 'Energizer', secondary: 'Activator', tieBreaker: { q: 16, letter: tb, driver: 'Energizer', ms: 900 } });
  });

  it('stops at the per-device daily cap and never rewrites an existing id', async () => {
    sb.setHandler('echo_quiz_results', quizTable({ recent: ECHO_QUIZ_DAILY_CAP }));
    expect(await (await save(jsonRequest('echo-quiz-save', body()))).json()).toEqual({ persisted: false, skipped: 'limit' });
    sb.setHandler('echo_quiz_results', quizTable({ exists: true }));
    expect(await (await save(jsonRequest('echo-quiz-save', body()))).json()).toEqual({ persisted: false, skipped: 'duplicate' });
  });

  it('is rate-limited per IP for a workshop room, separately from claims', async () => {
    sb.setHandler('echo_quiz_results', quizTable());
    for (let i = 0; i < RATE_LIMITS.echoQuizSave; i++) {
      const r = await save(jsonRequest('echo-quiz-save', body({ quizId: QUIZ })));
      expect(r.status).toBe(200);
    }
    expect((await save(jsonRequest('echo-quiz-save', body()))).status).toBe(429);
    const claimed = await save(jsonRequest('echo-quiz-save', { claim: true, anonSessionId: DEVICE, quizIds: [QUIZ] }, { headers: signIn() }));
    expect(claimed.status).toBe(200);
  });
});

describe('echo-quiz-save · claim', () => {
  it('requires sign-in', async () => {
    const res = await save(jsonRequest('echo-quiz-save', { claim: true, anonSessionId: DEVICE, quizIds: [QUIZ] }));
    expect(res.status).toBe(401);
  });

  it("moves only this device's anonymous rows, guarded in the statement", async () => {
    sb.setHandler('echo_quiz_results', quizTable());
    const res = await save(
      jsonRequest('echo-quiz-save', { claim: true, anonSessionId: DEVICE, quizIds: [QUIZ, QUIZ, 'bad'] }, { headers: signIn('user-2') }),
    );
    expect(await res.json()).toEqual({ claimed: [QUIZ] });
    expect(sb.callsFor('echo_quiz_results')[0].ops).toEqual([
      { op: 'update', args: [{ user_id: 'user-2', anon_session_id: null }] },
      { op: 'in', args: ['id', [QUIZ]] },
      { op: 'is', args: ['user_id', null] },
      { op: 'eq', args: ['anon_session_id', DEVICE] },
      { op: 'select', args: ['id'] },
    ]);
  });

  it('reports a failed claim as an error', async () => {
    sb.setHandler('echo_quiz_results', () => ({ data: null, error: { message: 'down' } }));
    const res = await save(jsonRequest('echo-quiz-save', { claim: true, anonSessionId: DEVICE, quizIds: [QUIZ] }, { headers: signIn() }));
    expect(res.status).toBe(500);
  });
});
