/**
 * Backfill → Supabase, with one load-bearing invariant.
 *
 * `training_sessions.score_report` / `.score_overall` are server-authoritative:
 * a database trigger rejects any write to them from the `authenticated` role
 * (supabase/migrations/20260911000000_server_authoritative_scores.sql), and
 * only `ai-evaluate` may set them.
 *
 * The backfill is the one remaining place that could forget this. It builds
 * its rows from `pbt:sessions` in localStorage — user-controlled data — and
 * sends them as a SINGLE batch upsert, so one rejected column doesn't degrade
 * gracefully: the whole batch raises 42501 and an anonymous user upgrading to
 * an account loses their entire history from the cloud. The regression is
 * silent (the error is only `console.warn`ed) and the local copy still looks
 * fine, which is exactly how it would reach production unnoticed.
 *
 * Hence the explicit assertion below rather than a general shape check.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { postAi } = vi.hoisted(() => ({ postAi: vi.fn() }));
vi.mock('../../../services/aiApi', () => ({ postAi }));

import { backfillLocalDataToCloud } from '../backfillLocalData';
import { writeStorage } from '../../../lib/storage';
import { SESSIONS_KEY } from '../../../lib/sessionsKey';
import type { SessionRecord, ScoreReport } from '../../../services/types';

const USER_ID = '00000000-0000-4000-8000-00000000beef';

function scoreReport(overall: number): ScoreReport {
  return {
    acknowledge: overall,
    clarify: overall,
    transform: overall,
    empathy: overall,
    rapport: overall,
    overall,
    band: 'good',
    critique: 'Solid.',
    betterAlternative: '—',
    perDimensionNotes: {
      acknowledge: '',
      clarify: '',
      transform: '',
      empathy: '',
      rapport: '',
    },
    keyMoments: [],
    turnSentiment: [],
  };
}

function sessionRecord(id: string, report?: ScoreReport): SessionRecord {
  return {
    id,
    scenarioSummary: 'Lab, Adult. Cost pushback.',
    pushbackId: 'cost',
    driver: 'Analyzer',
    durationSeconds: 120,
    mode: 'text',
    scoreReport: report,
    transcript: [
      { role: 'ai', text: 'This is far too expensive.', timestamp: 1 },
      { role: 'user', text: 'I hear you — may I explain what it covers?', timestamp: 2 },
    ],
    createdAt: new Date().toISOString(),
  } as SessionRecord;
}

/**
 * Records each upsert per table so assertions can target one table.
 * `existing` = the caller's own `training_sessions` rows the backfill reads
 * back after the claim (`select('id, origin').in('id', …)`).
 */
function fakeSupabase(
  { existing = [], readError = null }: {
    existing?: Array<{ id: string; origin: string }>;
    readError?: { message: string } | null;
  } = {},
) {
  const upserts: Record<string, unknown[][]> = {};
  const sb = {
    from(table: string) {
      return {
        upsert: (rows: unknown) => {
          (upserts[table] ??= []).push(Array.isArray(rows) ? rows : [rows]);
          return Promise.resolve({ error: null });
        },
        insert: (rows: unknown) => {
          (upserts[table] ??= []).push(Array.isArray(rows) ? rows : [rows]);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          in: () => Promise.resolve(readError ? { data: null, error: readError } : { data: existing, error: null }),
        }),
      };
    },
  };
  return { sb, upserts };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  postAi.mockReset();
  // Default: the claim succeeds and finds nothing anonymous on the server.
  postAi.mockResolvedValue({ claimed: [] });
});

describe('backfillLocalDataToCloud → training_sessions', () => {
  it('never sends the server-authoritative score columns', async () => {
    writeStorage(SESSIONS_KEY, [
      sessionRecord('11111111-1111-4111-8111-111111111111', scoreReport(93)),
      sessionRecord('22222222-2222-4222-8222-222222222222'),
    ]);

    const { sb, upserts } = fakeSupabase();
    await backfillLocalDataToCloud(sb as never, USER_ID);

    const rows = (upserts['training_sessions'] ?? []).flat() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // `toBeUndefined` is not enough — an explicit `score_report: null` is
      // still a write the trigger rejects on INSERT.
      expect(Object.keys(row)).not.toContain('score_report');
      expect(Object.keys(row)).not.toContain('score_overall');
    }
  });

  it('still backfills the transcript and attributes it to the caller', async () => {
    writeStorage(SESSIONS_KEY, [
      sessionRecord('33333333-3333-4333-8333-333333333333', scoreReport(71)),
    ]);

    const { sb, upserts } = fakeSupabase();
    await backfillLocalDataToCloud(sb as never, USER_ID);

    const [row] = (upserts['training_sessions'] ?? []).flat() as Record<string, unknown>[];
    expect(row.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(row.user_id).toBe(USER_ID);
    expect(row.transcript).toHaveLength(2);
    // Locally-scored sessions are still marked completed — only the score
    // itself is withheld, so History/admin show the session with "—".
    expect(row.completed).toBe(true);
  });

  it('carries a valid stored difficulty into the scenario (the admin reads the level from it)', async () => {
    writeStorage(SESSIONS_KEY, [
      { ...sessionRecord('55555555-5555-4555-8555-555555555555', scoreReport(75)), difficulty: 4 },
      sessionRecord('66666666-6666-4666-8666-666666666666', scoreReport(75)),
      {
        ...sessionRecord('77777777-7777-4777-8777-777777777777', scoreReport(75)),
        difficulty: 9 as unknown as 4, // hand-edited localStorage
      },
    ]);

    const { sb, upserts } = fakeSupabase();
    await backfillLocalDataToCloud(sb as never, USER_ID);

    const rows = (upserts['training_sessions'] ?? []).flat() as Record<string, unknown>[];
    const scenarios = rows.map((r) => r.scenario as Record<string, unknown>);
    expect(scenarios[0].difficulty).toBe(4);
    expect(Object.keys(scenarios[1])).not.toContain('difficulty');
    expect(Object.keys(scenarios[2])).not.toContain('difficulty');
  });

  it('keeps the score in rag_documents metadata (that table is not guarded)', async () => {
    writeStorage(SESSIONS_KEY, [
      sessionRecord('44444444-4444-4444-8444-444444444444', scoreReport(88)),
    ]);

    const { sb, upserts } = fakeSupabase();
    await backfillLocalDataToCloud(sb as never, USER_ID);

    const [row] = (upserts['rag_documents'] ?? []).flat() as Record<string, unknown>[];
    const metadata = row.metadata as Record<string, unknown>;
    expect(metadata.score_overall).toBe(88);
  });
});


describe('backfill claims sessions the server already recorded anonymously', () => {
  const A = '44444444-4444-4444-8444-444444444444';
  const B = '55555555-5555-4555-8555-555555555555';
  const C = '66666666-6666-4666-8666-666666666666';

  it('claims this device’s rows first and uploads only those the account lacks complete', async () => {
    writeStorage(SESSIONS_KEY, [sessionRecord(A, scoreReport(80)), sessionRecord(B), sessionRecord(C)]);
    // A was recorded in full (server-verified score kept); B was rebuilt from
    // app activity (no transcript) — fill it; C was never on the server.
    postAi.mockResolvedValueOnce({ claimed: [{ id: A, complete: true }, { id: B, complete: false }] });
    const { sb, upserts } = fakeSupabase({
      existing: [
        { id: A, origin: 'app' },
        { id: B, origin: 'reconstructed' },
      ],
    });
    await backfillLocalDataToCloud(sb as never, USER_ID);

    const [endpoint, body] = postAi.mock.calls[0];
    expect(endpoint).toBe('/.netlify/functions/session-save');
    expect(body).toMatchObject({ claim: true, sessionIds: [A, B, C] });
    expect(typeof body.anonSessionId).toBe('string');

    const rows = (upserts['training_sessions'] ?? []).flat() as Record<string, unknown>[];
    expect(rows.map((r) => r.id)).toEqual([B, C]);
    expect(rows.every((r) => r.origin === 'app' && r.user_id === USER_ID)).toBe(true);
    // The claimed session gets its RAG document too (an anonymous one never had one).
    const rag = (upserts['rag_documents'] ?? []).flat() as Record<string, unknown>[];
    expect(rag.map((r) => r.session_id)).toEqual([A, B, C]);
  });

  it('never re-uploads a session the account already holds (every later load, the second sign-up run)', async () => {
    writeStorage(SESSIONS_KEY, [sessionRecord(A, scoreReport(80)), sessionRecord(B)]);
    // Already claimed earlier → the claim finds nothing; both rows are the account's.
    const { sb, upserts } = fakeSupabase({
      existing: [
        { id: A, origin: 'app' },
        { id: B, origin: 'app' },
      ],
    });
    await backfillLocalDataToCloud(sb as never, USER_ID);
    expect(upserts['training_sessions']).toBeUndefined();
    expect(upserts['rag_documents']).toBeUndefined();
  });

  it('uploads nothing when the claim fails — an anonymous row would fail the whole batch', async () => {
    writeStorage(SESSIONS_KEY, [sessionRecord(A), sessionRecord(B)]);
    postAi.mockRejectedValueOnce(new Error('429'));
    const { sb, upserts } = fakeSupabase();
    await backfillLocalDataToCloud(sb as never, USER_ID);
    expect(upserts['training_sessions']).toBeUndefined();
    expect(upserts['rag_documents']).toBeUndefined();
  });

  it('uploads nothing when the account’s rows cannot be read', async () => {
    writeStorage(SESSIONS_KEY, [sessionRecord(A)]);
    const { sb, upserts } = fakeSupabase({ readError: { message: 'boom' } });
    await backfillLocalDataToCloud(sb as never, USER_ID);
    expect(upserts['training_sessions']).toBeUndefined();
  });
});
