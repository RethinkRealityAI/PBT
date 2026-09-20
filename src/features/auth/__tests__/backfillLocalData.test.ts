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

/** Records each upsert per table so assertions can target one table. */
function fakeSupabase() {
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
        }),
      };
    },
  };
  return { sb, upserts };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
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
