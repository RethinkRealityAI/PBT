import { describe, it, expect } from 'vitest';
import {
  computeScoreDelta,
  emotionJourney,
  weakestDimension,
} from '../scorecardInsights';
import { isScoreUnavailable, type ChatMessage, type ScoreReport, type SessionRecord } from '../../../services/types';

function makeReport(overrides: Partial<ScoreReport> = {}): ScoreReport {
  return {
    acknowledge: 80,
    clarify: 75,
    transform: 70,
    empathy: 85,
    rapport: 78,
    overall: 77,
    band: 'ok',
    critique: 'Solid work.',
    betterAlternative: 'Try…',
    perDimensionNotes: {
      acknowledge: '',
      clarify: '',
      transform: '',
      empathy: '',
      rapport: '',
    },
    keyMoments: [],
    ...overrides,
  };
}

function makeSession(id: string, overall: number, extra: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id,
    scenarioSummary: 'Cost pushback · Lab',
    pushbackId: 'cost',
    driver: 'Activator',
    durationSeconds: 120,
    mode: 'text',
    scoreReport: makeReport({ overall }),
    transcript: [],
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

describe('computeScoreDelta', () => {
  it('reports first scored session when history is empty', () => {
    const d = computeScoreDelta([], 'current', 80);
    expect(d.kind).toBe('first');
    expect(d.personalBest).toBe(false);
    expect(d.previousOverall).toBeNull();
  });

  it('excludes the current session by id', () => {
    const d = computeScoreDelta([makeSession('current', 80)], 'current', 80);
    expect(d.kind).toBe('first');
  });

  it('computes improvement vs the most recent prior session', () => {
    const sessions = [makeSession('b', 70), makeSession('a', 90)]; // newest first
    const d = computeScoreDelta(sessions, 'current', 76);
    expect(d.kind).toBe('improved');
    expect(d.delta).toBe(6);
    expect(d.previousOverall).toBe(70);
    expect(d.personalBest).toBe(false); // 90 in history
  });

  it('flags a personal best only when strictly above all priors', () => {
    const sessions = [makeSession('b', 70), makeSession('a', 84)];
    expect(computeScoreDelta(sessions, 'current', 85).personalBest).toBe(true);
    expect(computeScoreDelta(sessions, 'current', 84).personalBest).toBe(false);
  });

  it('reports drops with a negative delta', () => {
    const d = computeScoreDelta([makeSession('a', 88)], 'current', 80);
    expect(d.kind).toBe('dropped');
    expect(d.delta).toBe(-8);
  });

  it('ignores scoring-unavailable placeholder records', () => {
    const broken = makeSession('broken', 0);
    broken.scoreReport = makeReport({ overall: 0, scoreUnavailable: true });
    const d = computeScoreDelta([broken, makeSession('a', 72)], 'current', 75);
    expect(d.kind).toBe('improved');
    expect(d.previousOverall).toBe(72);
  });
});

describe('emotionJourney', () => {
  const msg = (role: 'user' | 'ai', emotion?: 'red' | 'yellow' | 'green'): ChatMessage => ({
    role,
    text: 'x',
    timestamp: 0,
    emotion,
  });

  it('extracts AI-turn emotions in order', () => {
    const transcript = [
      msg('ai', 'red'),
      msg('user'),
      msg('ai', 'yellow'),
      msg('user'),
      msg('ai', 'green'),
    ];
    expect(emotionJourney(transcript)).toEqual(['red', 'yellow', 'green']);
  });

  it('returns empty for transcripts without emotion data', () => {
    expect(emotionJourney([msg('ai'), msg('user')])).toEqual([]);
  });

  it('skips transient error messages', () => {
    const err: ChatMessage = { role: 'ai', text: 'oops', timestamp: 0, emotion: 'red', _transientError: true };
    expect(emotionJourney([err, msg('ai', 'green')])).toEqual(['green']);
  });
});

describe('weakestDimension', () => {
  it('returns the lowest-scoring dimension', () => {
    const report = makeReport({ acknowledge: 90, clarify: 40, transform: 80, empathy: 85, rapport: 70 });
    expect(weakestDimension(report).key).toBe('clarify');
  });

  it('breaks ties by rubric weight (heavier first)', () => {
    // clarify (0.24) and rapport (0.12) tied at 50 → clarify has more leverage.
    const report = makeReport({ acknowledge: 90, clarify: 50, transform: 80, empathy: 85, rapport: 50 });
    expect(weakestDimension(report).key).toBe('clarify');
  });
});

describe('isScoreUnavailable', () => {
  it('recognises the explicit flag', () => {
    expect(isScoreUnavailable(makeReport({ scoreUnavailable: true }))).toBe(true);
  });

  it('recognises legacy placeholder records by critique + zero overall', () => {
    expect(
      isScoreUnavailable(makeReport({ overall: 0, critique: 'Scoring unavailable.' })),
    ).toBe(true);
    expect(
      isScoreUnavailable(
        makeReport({
          overall: 0,
          critique:
            'We could not score this session right now. Please try again, or check your network.',
        }),
      ),
    ).toBe(true);
  });

  it('treats a genuine zero-adjacent score as real', () => {
    expect(isScoreUnavailable(makeReport({ overall: 12 }))).toBe(false);
    expect(isScoreUnavailable(makeReport())).toBe(false);
  });

  it('treats null as unavailable', () => {
    expect(isScoreUnavailable(null)).toBe(true);
  });
});
