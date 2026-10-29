/**
 * `toSessionSummary` — one stored `training_sessions` row → what the
 * Analytics tabs read. The jsonb columns were written by several
 * generations of the app, so every field is pinned on a full modern row AND
 * on the shapes it must tolerate (backfills, sanitized copies, legacy and
 * placeholder reports, junk) without throwing or inventing a value.
 */
import { describe, expect, it } from 'vitest';
import {
  countHintsBySession,
  scenarioSourceOf,
  scoreUnavailableOf,
  scoringFailedOf,
  fromLiteRow,
  SESSION_SUMMARY_LITE_COLUMNS,
  toSessionSummary,
} from '../sessionSummary';

const T = Date.parse('2026-10-01T12:00:00.000Z');

function report(over: Record<string, unknown> = {}) {
  return {
    acknowledge: 80,
    clarify: 70,
    transform: 60,
    empathy: 90,
    rapport: 75,
    overall: 74,
    band: 'ok',
    critique: 'Solid.',
    betterAlternative: '',
    perDimensionNotes: {},
    keyMoments: [
      { ts: '0:10', type: 'win', label: 'a', quote: 'q' },
      { ts: '0:20', type: 'miss', label: 'b', quote: 'q' },
      { ts: '0:30', type: 'win', label: 'c', quote: 'q' },
    ],
    turnSentiment: [
      { idx: 0, speaker: 'customer', sentiment: -0.6 },
      { idx: 1, speaker: 'staff', sentiment: 0.4 },
      { idx: 2, speaker: 'customer', sentiment: 0.1 },
      { idx: 4, speaker: 'customer', sentiment: 0.7 },
    ],
    ...over,
  };
}

function fullRow(over: Record<string, unknown> = {}) {
  return {
    id: 's-1',
    user_id: 'u-1',
    created_at: '2026-10-01T12:10:00.000Z',
    duration_seconds: 300,
    mode: 'text',
    completed: true,
    ended_reason: 'completed',
    turns: 5,
    pushback_id: 'cost',
    driver: 'Analyzer',
    scenario_summary: 'Lab · cost',
    scenario: {
      breed: 'Lab',
      age: 'Adult (3-7)',
      pushback: { id: 'cost', title: 'Cost concerns', example: '"Too pricey."' },
      persona: 'Skeptical',
      difficulty: 3,
      suggestedDriver: 'Analyzer',
      _overrideId: 'seed:1',
    },
    transcript: [
      { role: 'ai', text: 'Too pricey.', timestamp: T, emotion: 'red' },
      { role: 'user', text: 'I hear you, cost matters.', timestamp: T + 20_000 },
      { role: 'ai', text: 'Go on.', timestamp: T + 30_000, emotion: 'yellow' },
      { role: 'user', text: 'What do you feed now?', timestamp: T + 40_000 },
      { role: 'ai', text: 'OK, I will try it.', timestamp: T + 60_000, emotion: 'green' },
    ],
    score_report: report(),
    score_overall: 74,
    ...over,
  };
}

describe('toSessionSummary — a session scored after an interruption', () => {
  it('is flagged recovered from score_report.recovered, in the full and lite reads', () => {
    const row = fullRow();
    const recovered = { ...row, score_report: { ...(row.score_report as object), recovered: { at: '2026-10-29T20:00:00Z', endedReason: 'user_exit' } } };
    expect(toSessionSummary(recovered).recovered).toBe(true);
    expect(toSessionSummary(row).recovered).toBe(false);
    const lite = fromLiteRow({ ...row, score_report: undefined, sr_overall: 70, sr_recovered: { at: 'x', endedReason: 'interrupted' } });
    expect(toSessionSummary(lite).recovered).toBe(true);
  });
});

describe('toSessionSummary — a full modern row', () => {
  it('derives every field', () => {
    const s = toSessionSummary(fullRow(), { hintsBySession: new Map([['s-1', 2]]) });
    expect(s).toEqual({
      id: 's-1',
      user_id: 'u-1',
      anon_session_id: null,
      locale: null,
      reconstructed: false,
      recovered: false,
      created_at: '2026-10-01T12:10:00.000Z',
      started_at: '2026-10-01T12:05:00.000Z',
      completed: true,
      ended_reason: 'completed',
      mode: 'text',
      duration_seconds: 300,
      turns: 5,
      pushback_id: 'cost',
      owner_driver: 'Analyzer',
      scenario_summary: 'Lab · cost',
      scenario_title: 'Cost concerns',
      objection_title: 'Cost concerns',
      scenario_source: 'library',
      scenario_id: 'seed:1',
      difficulty: 3,
      species: 'dog',
      breed: 'Lab',
      persona: 'Skeptical',
      score_overall: 74,
      score_unavailable: false,
      skills: { acknowledge: 80, clarify: 70, transform: 60, empathy: 90, rapport: 75 },
      band: 'ok',
      owner_sentiment_start: -0.6,
      owner_sentiment_end: 0.7,
      owner_mood_end: 'green',
      staff_messages: 2,
      // 5 words + 5 words over 2 messages.
      staff_words_avg: 5,
      // Replies after 20 s and 10 s.
      reply_seconds_median: 15,
      hints_used: 2,
      key_wins: 2,
      key_misses: 1,
    });
  });

  it('prefers a stored scenario title over the pushback title', () => {
    const row = fullRow();
    (row.scenario as Record<string, unknown>).title = 'Buddy the big Lab';
    expect(toSessionSummary(row).scenario_title).toBe('Buddy the big Lab');
  });

  it('reads cats as cats and everything else as dogs', () => {
    const cat = fullRow();
    (cat.scenario as Record<string, unknown>).species = 'cat';
    expect(toSessionSummary(cat).species).toBe('cat');
    const odd = fullRow();
    (odd.scenario as Record<string, unknown>).species = 'hamster';
    expect(toSessionSummary(odd).species).toBe('dog');
  });
});

describe('anonymous sessions (no account)', () => {
  it('has no user, keeps the device id and the language', () => {
    const s = toSessionSummary(fullRow({ user_id: null, anon_session_id: 'dev-4f2a-0001', locale: 'fr' }));
    expect(s.user_id).toBeNull();
    expect(s.anon_session_id).toBe('dev-4f2a-0001');
    expect(s.locale).toBe('fr');
    expect(s.reconstructed).toBe(false);
    // An app-recorded anonymous session is a full session: scored like any other.
    expect(s.score_overall).toBe(74);
  });

  it('a signed-in row never carries a device id, whatever the column says', () => {
    const s = toSessionSummary(fullRow({ anon_session_id: 'dev-4f2a-0001' }));
    expect(s.user_id).toBe('u-1');
    expect(s.anon_session_id).toBeNull();
  });

  it('a rebuilt row: known facts only — no transcript, no score, not a scoring failure', () => {
    const s = toSessionSummary({
      id: 'r-1',
      user_id: null,
      anon_session_id: 'dev-4f2a-0001',
      origin: 'reconstructed',
      scenario: { pushback: { id: 'cost' } },
      transcript: [],
      mode: 'text',
      completed: true,
      ended_reason: 'completed',
      pushback_id: 'cost',
      duration_seconds: 240,
      model_id: null,
      turns: null,
      created_at: '2026-10-01T12:10:00.000Z',
    });
    expect(s.reconstructed).toBe(true);
    expect(s.pushback_id).toBe('cost');
    expect(s.completed).toBe(true);
    expect(s.score_overall).toBeNull();
    expect(s.score_unavailable).toBe(false);
    expect(s.skills).toBeNull();
    // Unknown, not "0 messages".
    expect(s.turns).toBeNull();
    expect(s.scenario_source).toBe('unknown');
    expect(s.locale).toBeNull();
  });

  it('a rebuilt row keeps the message count the app logged', () => {
    const s = toSessionSummary({ id: 'r-2', anon_session_id: 'dev', origin: 'reconstructed', transcript: [], turns: 6 });
    expect(s.turns).toBe(6);
  });
});

describe('scenario source', () => {
  it('maps override ids', () => {
    expect(scenarioSourceOf({ _overrideId: 'seed:0' })).toEqual({ source: 'library', id: 'seed:0' });
    expect(scenarioSourceOf({ _overrideId: 'admin:abc' })).toEqual({ source: 'studio', id: 'admin:abc' });
    expect(scenarioSourceOf({ _overrideId: 'user:abc' })).toEqual({ source: 'self-built', id: 'user:abc' });
    expect(scenarioSourceOf({ _overrideId: 'weird:1' })).toEqual({ source: 'unknown', id: 'weird:1' });
  });

  it('calls a full client scenario without an id self-built, a backfill unknown', () => {
    const full = { breed: 'Lab', age: 'Puppy (<1)', persona: 'Anxious', pushback: { id: 'cost', title: 'Cost' } };
    expect(scenarioSourceOf(full)).toEqual({ source: 'self-built', id: null });
    expect(scenarioSourceOf({ pushback: { id: 'cost' }, persona: 'Anxious' }).source).toBe('self-built');
    expect(scenarioSourceOf({ summary: 'backfilled', pushbackId: 'cost' })).toEqual({ source: 'unknown', id: null });
    expect(scenarioSourceOf({ pushback: { id: 'cost' } }).source).toBe('unknown');
    expect(scenarioSourceOf(null).source).toBe('unknown');
    expect(scenarioSourceOf('seed:1').source).toBe('unknown');
  });
});

describe('scores', () => {
  it('a scoring-failure placeholder is unavailable, never a 0', () => {
    const s = toSessionSummary(
      fullRow({
        score_report: report({ overall: 0, scoreUnavailable: true, keyMoments: [] }),
        score_overall: 0,
      }),
    );
    expect(s.score_unavailable).toBe(true);
    expect(s.score_overall).toBeNull();
    expect(s.skills).toBeNull();
    expect(s.band).toBeNull();
    expect(s.owner_sentiment_start).toBeNull();
  });

  it('recognises the older placeholder by its critique', () => {
    const s = toSessionSummary(
      fullRow({ score_report: report({ overall: 0, critique: 'Scoring unavailable.' }), score_overall: 0 }),
    );
    expect(s.score_unavailable).toBe(true);
    expect(s.score_overall).toBeNull();
  });

  it('an unscored session (no report) is not a failure and has no score', () => {
    const s = toSessionSummary(fullRow({ score_report: null, score_overall: null }));
    expect(s.score_unavailable).toBe(false);
    expect(s.score_overall).toBeNull();
    expect(s.skills).toBeNull();
    expect(s.key_wins).toBe(0);
  });

  it('a pre-Phase-2 report keeps its overall but has no skills', () => {
    const legacy = { overall: 62, band: 'ok', critique: 'Fine', keyMoments: [], empathyTone: 7 };
    const s = toSessionSummary(fullRow({ score_report: legacy, score_overall: 62 }));
    expect(s.score_overall).toBe(62);
    expect(s.skills).toBeNull();
  });

  it('falls back to the report’s overall when the column is empty', () => {
    expect(toSessionSummary(fullRow({ score_overall: null })).score_overall).toBe(74);
  });

  it('a malformed report never throws', () => {
    // overall 0 with a non-string critique trips the strict reader.
    expect(() => toSessionSummary(fullRow({ score_report: { overall: 0, critique: 42 } }))).not.toThrow();
    expect(scoreUnavailableOf({ overall: 0, critique: 42 })).toBe(false);
    expect(scoreUnavailableOf({ overall: 0, critique: 42, scoreUnavailable: true })).toBe(true);
    expect(scoreUnavailableOf(null)).toBe(false);
    expect(scoreUnavailableOf('nope')).toBe(false);
  });

  it('reads owner sentiment by turn index, clamped, ignoring junk', () => {
    const s = toSessionSummary(
      fullRow({
        score_report: report({
          turnSentiment: [
            { idx: 6, speaker: 'customer', sentiment: 3 },
            { idx: 2, speaker: 'customer', sentiment: -0.2 },
            { idx: 1, speaker: 'customer', sentiment: 'x' },
            null,
            { idx: 0, speaker: 'staff', sentiment: -1 },
          ],
        }),
      }),
    );
    expect(s.owner_sentiment_start).toBe(-0.2);
    expect(s.owner_sentiment_end).toBe(1);
  });
});

describe('transcript', () => {
  it('owner mood = the last AI message that carries one', () => {
    const s = toSessionSummary(
      fullRow({
        transcript: [
          { role: 'ai', text: 'a', timestamp: T, emotion: 'red' },
          { role: 'user', text: 'b', timestamp: T + 1000 },
          { role: 'ai', text: 'c', timestamp: T + 2000, emotion: 'yellow' },
          { role: 'ai', text: 'd', timestamp: T + 3000 },
          { role: 'ai', text: 'e', timestamp: T + 4000, emotion: 'purple' },
          { role: 'user', text: 'f', timestamp: T + 5000, emotion: 'green' },
        ],
      }),
    );
    expect(s.owner_mood_end).toBe('yellow');
  });

  it('reply time: only owner → trainee pairs, 0–600 s, text mode only', () => {
    const transcript = [
      { role: 'ai', text: 'a', timestamp: T },
      { role: 'user', text: 'b', timestamp: T + 4_000 }, // 4 s
      { role: 'user', text: 'c', timestamp: T + 9_000 }, // not after an owner message
      { role: 'ai', text: 'd', timestamp: T + 10_000 },
      { role: 'user', text: 'e', timestamp: T + 10_000 + 700_000 }, // > 600 s: a pause
      { role: 'ai', text: 'f', timestamp: T + 800_000 },
      { role: 'user', text: 'g', timestamp: T + 799_000 }, // negative: clock skew
      { role: 'ai', text: 'h', timestamp: 'later' },
      { role: 'user', text: 'i', timestamp: T + 900_000 }, // unreadable owner time
      { role: 'ai', text: 'j', timestamp: T + 1_000_000 },
      { role: 'user', text: 'k', timestamp: T + 1_008_000 }, // 8 s
      { role: 'ai', text: 'l', timestamp: T + 1_100_000 },
      { role: 'user', text: 'm', timestamp: T + 1_106_000 }, // 6 s
    ];
    expect(toSessionSummary(fullRow({ transcript })).reply_seconds_median).toBe(6);
    expect(toSessionSummary(fullRow({ transcript, mode: 'voice' })).reply_seconds_median).toBeNull();
    // Unknown mode still counts (older text rows).
    expect(toSessionSummary(fullRow({ transcript, mode: null })).reply_seconds_median).toBe(6);
  });

  it('reads ISO-string timestamps too', () => {
    const transcript = [
      { role: 'ai', text: 'a', timestamp: '2026-10-01T12:00:00.000Z' },
      { role: 'user', text: 'b', timestamp: '2026-10-01T12:00:12.500Z' },
    ];
    expect(toSessionSummary(fullRow({ transcript })).reply_seconds_median).toBe(12.5);
  });

  it('no pairs → null; no trainee messages → zero and null words', () => {
    const s = toSessionSummary(fullRow({ transcript: [{ role: 'ai', text: 'hello', timestamp: T }] }));
    expect(s.reply_seconds_median).toBeNull();
    expect(s.staff_messages).toBe(0);
    expect(s.staff_words_avg).toBeNull();
  });

  it('counts words per trainee message (a missing text is zero words) and skips error bubbles', () => {
    const s = toSessionSummary(
      fullRow({
        transcript: [
          { role: 'user', text: '  one   two three ' },
          { role: 'user' },
          { role: 'user', text: 'four', _transientError: true },
          { role: 'ai', text: 'Something went wrong', _transientError: true },
        ],
        turns: null,
      }),
    );
    expect(s.staff_messages).toBe(2);
    expect(s.staff_words_avg).toBe(1.5);
    // `turns` falls back to the conversation's real messages.
    expect(s.turns).toBe(2);
  });
});

describe('hints', () => {
  it('null when the caller had no hint data; 0 is a real zero', () => {
    expect(toSessionSummary(fullRow()).hints_used).toBeNull();
    expect(toSessionSummary(fullRow(), { hintsBySession: new Map() }).hints_used).toBe(0);
  });

  it('countHintsBySession counts meta.sessionId and ignores junk', () => {
    const map = countHintsBySession([
      { meta: { sessionId: 'a', turn: 1 } },
      { meta: { sessionId: 'a', turn: 3 } },
      { meta: { sessionId: 'b' } },
      { meta: { sessionId: 7 } },
      { meta: null },
      {},
    ]);
    expect([...map.entries()]).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

describe('tolerance', () => {
  it('never throws on junk and falls back to nulls', () => {
    const junk: unknown[] = [
      {},
      { id: 's', scenario: 'nope', transcript: 'nope', score_report: 'nope' },
      { id: 's', scenario: [], transcript: [null, 1, 'x', { role: 'user', text: 5 }], score_report: [] },
      { id: 's', scenario: { pushback: 'x', difficulty: '9' }, score_report: { keyMoments: 'x', turnSentiment: {} } },
      null,
    ];
    for (const row of junk) {
      expect(() => toSessionSummary(row as Record<string, unknown>)).not.toThrow();
    }
    const s = toSessionSummary({ id: 's', created_at: 'not a date', duration_seconds: 'x' });
    expect(s.started_at).toBeNull();
    expect(s.duration_seconds).toBeNull();
    expect(s.mode).toBeNull();
    expect(s.turns).toBeNull();
    expect(s.difficulty).toBeNull();
    expect(s.scenario_source).toBe('unknown');
    expect(s.completed).toBe(false);
  });

  it('a backfilled three-field scenario reads what it can', () => {
    const s = toSessionSummary({
      id: 's-2',
      user_id: 'u',
      created_at: '2026-10-01T00:00:00Z',
      scenario: { summary: 'Lab · cost', pushbackId: 'cost', difficulty: 2 },
      pushback_id: null,
      driver: null,
    });
    expect(s.difficulty).toBe(2);
    expect(s.pushback_id).toBeNull();
    expect(s.owner_driver).toBeNull();
    expect(s.scenario_title).toBeNull();
    expect(s.breed).toBeNull();
    expect(s.started_at).toBeNull();
  });

  it('falls back to the scenario for pushback id and driver when the columns are empty', () => {
    const s = toSessionSummary(fullRow({ pushback_id: null, driver: null }));
    expect(s.pushback_id).toBe('cost');
    expect(s.owner_driver).toBe('Analyzer');
  });
});

describe('scoringFailedOf — one definition of a failed scoring', () => {
  it('flags a finished session the app saved with no report (the scorer failed; ai-evaluate persisted nothing)', () => {
    const row = fullRow({ score_report: null, score_overall: null, model_id: 'gemini-3-flash-preview' });
    expect(scoringFailedOf(row)).toBe(true);
    const s = toSessionSummary(row);
    expect(s.score_unavailable).toBe(true);
    expect(s.score_overall).toBeNull();
  });

  it('flags the old placeholder report', () => {
    expect(scoringFailedOf(fullRow({ score_report: report({ overall: 0, scoreUnavailable: true }) }))).toBe(true);
  });

  it('does not flag a device backfill — completed, no report, no model, a three-field scenario', () => {
    const backfill = fullRow({
      score_report: null,
      score_overall: null,
      model_id: undefined,
      scenario: { summary: 'Lab · cost', pushbackId: 'cost', driver: 'Analyzer' },
    });
    expect(scoringFailedOf(backfill)).toBe(false);
    expect(toSessionSummary(backfill).score_unavailable).toBe(false);
  });

  it('does not flag a session left early, or a real score', () => {
    expect(scoringFailedOf(fullRow({ completed: false, score_report: null, model_id: 'm' }))).toBe(false);
    expect(scoringFailedOf(fullRow({ model_id: 'm' }))).toBe(false);
  });
});

describe('lite summaries (all-time figures, no transcripts)', () => {
  it('never selects the transcript or the whole report', () => {
    expect(SESSION_SUMMARY_LITE_COLUMNS).not.toMatch(/(^|[ ,])transcript([ ,]|$)/);
    expect(SESSION_SUMMARY_LITE_COLUMNS).not.toMatch(/(^|[ ,])score_report([ ,]|$)/);
  });

  it('rebuilds a row that summarises with the same scores, level, animal and source', () => {
    const full = fullRow({ model_id: 'm' });
    const r = full.score_report as Record<string, unknown>;
    const sc = full.scenario as Record<string, unknown>;
    const lite = fromLiteRow({
      id: full.id, user_id: full.user_id, created_at: full.created_at, completed: true, ended_reason: 'completed',
      mode: 'text', duration_seconds: 300, turns: 5, pushback_id: 'cost', driver: 'Analyzer', model_id: 'm',
      scenario_summary: full.scenario_summary, score_overall: 74,
      sr_acknowledge: r.acknowledge, sr_clarify: r.clarify, sr_transform: r.transform, sr_empathy: r.empathy,
      sr_rapport: r.rapport, sr_overall: r.overall, sr_band: r.band, sr_unavailable: null, sr_critique: r.critique,
      sc_difficulty: sc.difficulty, sc_species: null, sc_override: sc._overrideId, sc_pushback: sc.pushback,
      sc_breed: sc.breed, sc_persona: sc.persona, sc_age: sc.age,
    });
    const a = toSessionSummary(full);
    const b = toSessionSummary(lite);
    for (const k of ['score_overall', 'skills', 'score_unavailable', 'difficulty', 'species', 'scenario_source', 'band'] as const) {
      expect(b[k]).toEqual(a[k]);
    }
    expect(b.staff_messages).toBe(0); // transcript-derived: empty in lite
  });

  it('treats an all-null report path set as no report (so a live failure still reads as failed)', () => {
    const lite = fromLiteRow({ id: 'x', completed: true, model_id: 'm', sc_pushback: { id: 'cost' }, sr_overall: null });
    expect(lite.score_report).toBeNull();
    expect(toSessionSummary(lite).score_unavailable).toBe(true);
  });
});
