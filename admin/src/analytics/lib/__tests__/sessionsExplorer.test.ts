import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  activeFilterCount,
  filterSessions,
  fmtLength,
  inWindowWords,
  matchesQuery,
  objectionIfDifferent,
  objectionOptions,
  outcomeCounts,
  outcomeWords,
  scenarioContext,
  sessionOutcome,
  sessionTitle,
  sessionsCsv,
  sortSessions,
  clearSessionFilterPreset,
  presetSessionFilters,
  sessionFilterPreset,
  whoName,
} from '../sessionsExplorer';
import { deviceTag } from '../who';
import { anonSession, rebuiltSession, session } from './fixtures';

const failed = () => session({ score_unavailable: true, score_overall: 0, skills: null });
const left = (reason: string | null = 'user_exit') =>
  session({ completed: false, ended_reason: reason, score_overall: null, skills: null, owner_mood_end: null });

describe('sessionsExplorer outcomes', () => {
  it('classifies finished, left early and scoring failed', () => {
    expect(sessionOutcome(session())).toBe('finished');
    expect(sessionOutcome(failed())).toBe('failed');
    expect(sessionOutcome(left())).toBe('left');
  });

  it('words a left-early row by its reason, never a raw key', () => {
    expect(outcomeWords(left('user_exit'))).toBe('Left early');
    expect(outcomeWords(left('timeout'))).toBe('Timed out');
    expect(outcomeWords(left('error'))).toBe('Ended by an error');
    // A contradictory row (reason says completed, flag says not) is still early.
    expect(outcomeWords(left('completed'))).toBe('Left early');
    expect(outcomeWords(failed())).toBe('Scoring failed');
  });

  it('an unfinished session with no recorded reason reads "Ending not recorded", never "Left early"', () => {
    expect(sessionOutcome(left(null))).toBe('unknown');
    expect(outcomeWords(left(null))).toBe('Ending not recorded');
    expect(outcomeWords(rebuiltSession('d', 'unknown'))).toBe('Ending not recorded');
    expect(outcomeWords(rebuiltSession('d', 'left'))).toBe('Left early');
    expect(outcomeWords(rebuiltSession('d', 'finished'))).toBe('Finished');
  });

  it('counts chips: finished + left + not recorded = all; failed and low are subsets of finished', () => {
    const rows = [session({ score_overall: 90 }), session({ score_overall: 40 }), failed(), left(), left(), left(null)];
    const c = outcomeCounts(rows);
    expect(c).toEqual({ all: 6, finished: 3, left: 2, unknown: 1, failed: 1, low: 1 });
  });

  it('a rebuilt session that reached the scorecard is finished, never low or failed', () => {
    const c = outcomeCounts([rebuiltSession('d', 'finished')]);
    expect(c).toMatchObject({ finished: 1, failed: 0, low: 0 });
  });

  it('never counts a scoring failure as a low score', () => {
    expect(outcomeCounts([failed()]).low).toBe(0);
  });
});

describe('sessionsExplorer words', () => {
  it('phrases a window so "all time" still reads', () => {
    expect(inWindowWords('28d')).toBe('in the last 28 days');
    expect(inWindowWords('all')).toBe('so far');
  });

  it('titles a session by title, then summary, then objection', () => {
    expect(sessionTitle(session({ scenario_title: 'Senior lab', scenario_summary: 'x' }))).toBe('Senior lab');
    expect(sessionTitle(session({ scenario_title: null, scenario_summary: 'Beagle · Cost' }))).toBe('Beagle · Cost');
    expect(sessionTitle(session({ scenario_title: null, scenario_summary: null, pushback_id: 'weight-denial' }))).toBe(
      'Weight / obesity denial',
    );
  });

  it('names the objection only when the title does not already say it', () => {
    const studio = session({ scenario_title: 'Senior lab, cost-sensitive owner', scenario_source: 'studio', pushback_id: 'cost' });
    expect(objectionIfDifferent(studio)).toBe('Cost / price pushback');
    const library = session({ scenario_title: 'Cost / price pushback', scenario_source: 'library', pushback_id: 'cost' });
    expect(objectionIfDifferent(library)).toBeNull();
    // The stored objection title wording can differ from the portal label — still the same thing.
    const selfBuilt = session({ scenario_title: 'Price objection', scenario_source: 'self-built', pushback_id: 'cost' });
    expect(objectionIfDifferent(selfBuilt)).toBeNull();
    expect(objectionIfDifferent(session({ pushback_id: null }))).toBeNull();
  });

  it('builds the muted context line without empty parts', () => {
    expect(scenarioContext(session({ species: 'cat', breed: 'Siamese', persona: 'Anxious', scenario_source: 'studio' }))).toBe(
      'Cat · Siamese · Anxious owner · Studio',
    );
    expect(scenarioContext(session({ breed: null, persona: null, scenario_source: 'unknown' }))).toBe('Dog');
  });

  it('formats a length', () => {
    expect(fmtLength(252)).toBe('4m 12s');
    expect(fmtLength(120)).toBe('2m');
    expect(fmtLength(42)).toBe('42s');
    expect(fmtLength(null)).toBe('—');
    expect(fmtLength(0)).toBe('—');
  });
});

describe('sessionsExplorer filters', () => {
  const rows = [
    session({ user_id: 'u1', mode: 'voice', difficulty: 3, pushback_id: 'cost', species: 'dog', breed: 'Beagle' }),
    session({ user_id: 'u2', mode: 'text', difficulty: 1, pushback_id: 'rx-diet', species: 'cat', breed: 'Siamese' }),
    left(),
  ];
  const names: Record<string, string> = { u1: 'Marie Tremblay', u2: 'Sam Okafor' };
  const nameOf = (id: string) => names[id] ?? 'Unknown trainee';

  it('applies selects and the outcome chip; chips count within the selects', () => {
    const r = filterSessions(rows, { ...NO_FILTERS, mode: 'text', outcome: 'finished' }, '', nameOf);
    expect(r.rows.map((s) => s.user_id)).toEqual(['u2']);
    // The chip base keeps the left-early text session so its chip count is right.
    expect(r.chipBase).toHaveLength(2);
  });

  it('filters by difficulty, objection, animal and source', () => {
    expect(filterSessions(rows, { ...NO_FILTERS, difficulty: '3' }, '', nameOf).rows).toHaveLength(1);
    expect(filterSessions(rows, { ...NO_FILTERS, objection: 'rx-diet' }, '', nameOf).rows).toHaveLength(1);
    expect(filterSessions(rows, { ...NO_FILTERS, species: 'cat' }, '', nameOf).rows).toHaveLength(1);
    expect(filterSessions(rows, { ...NO_FILTERS, source: 'studio' }, '', nameOf).rows).toHaveLength(0);
  });

  it('searches names, objection labels, breed and difficulty words; every term must match', () => {
    expect(matchesQuery(rows[0], 'Marie Tremblay', 'marie')).toBe(true);
    expect(matchesQuery(rows[0], 'Marie Tremblay', 'price')).toBe(true); // "Cost / price pushback"
    expect(matchesQuery(rows[1], 'Sam Okafor', 'siamese coachable')).toBe(true);
    expect(matchesQuery(rows[1], 'Sam Okafor', 'siamese hostile')).toBe(false);
    expect(matchesQuery(rows[1], 'Sam Okafor', '  ')).toBe(true);
  });

  it('counts active filters, outcome included', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, outcome: 'low', species: 'cat' })).toBe(2);
  });

  it('filters by who and by language', () => {
    const mixed = [
      session({ user_id: 'u1', locale: 'en' }),
      anonSession('dev-a', { locale: 'fr' }),
      anonSession('dev-b', { locale: 'fr' }),
      rebuiltSession('dev-b', 'unknown'),
    ];
    const ids = (f: Partial<typeof NO_FILTERS>) =>
      filterSessions(mixed, { ...NO_FILTERS, ...f }, '', nameOf).rows.length;
    expect(ids({ who: 'anonymous' })).toBe(3);
    expect(ids({ who: 'signed_in' })).toBe(1);
    expect(ids({ language: 'fr' })).toBe(2);
    expect(ids({ language: 'en' })).toBe(1);
    expect(ids({ language: 'none' })).toBe(1);
    expect(ids({ who: 'anonymous', language: 'fr' })).toBe(2);
    expect(activeFilterCount({ ...NO_FILTERS, who: 'anonymous', language: 'fr' })).toBe(2);
  });

  it('a rebuilt session matches neither Dog nor Cat — its animal was never stored', () => {
    const r = [rebuiltSession('dev', 'finished')];
    expect(filterSessions(r, { ...NO_FILTERS, species: 'dog' }, '', nameOf).rows).toHaveLength(0);
    expect(filterSessions(r, { ...NO_FILTERS, species: 'cat' }, '', nameOf).rows).toHaveLength(0);
    expect(scenarioContext(r[0])).toBe('');
  });

  it('names an anonymous session by its device, never by a trainee lookup', () => {
    const calls: string[] = [];
    const lookup = (id: string) => {
      calls.push(id);
      return 'Unknown trainee';
    };
    const anon = anonSession('dev-a', { locale: 'fr' });
    expect(whoName(anon, lookup)).toBe(`Anonymous · Device ${deviceTag('dev-a')}`);
    expect(calls).toEqual([]);
    // Search finds it by "anonymous", its device tag and its language.
    const q = (text: string) => filterSessions([anon], NO_FILTERS, text, lookup).rows.length;
    expect(q('anonymous')).toBe(1);
    expect(q(`device ${deviceTag('dev-a')}`)).toBe(1);
    expect(q('français')).toBe(1);
    expect(q('rebuilt')).toBe(0);
    expect(filterSessions([rebuiltSession('dev-a', 'left')], NO_FILTERS, 'rebuilt', lookup).rows).toHaveLength(1);
    expect(calls).toEqual([]);
  });

  it('hands a filter preset to the Sessions tab once', () => {
    presetSessionFilters({ who: 'anonymous' });
    expect(sessionFilterPreset()).toEqual({ ...NO_FILTERS, who: 'anonymous' });
    // Read again before it is cleared (a double render) — still there.
    expect(sessionFilterPreset().who).toBe('anonymous');
    clearSessionFilterPreset();
    expect(sessionFilterPreset()).toEqual(NO_FILTERS);
  });

  it('lists objections present in the data by their label', () => {
    expect(objectionOptions(rows).map((o) => o.label)).toEqual(['Cost / price pushback', 'Skepticism on Rx diet']);
    expect(objectionOptions(rows).find((o) => o.value === 'cost')?.count).toBe(2);
  });
});

describe('sessionsExplorer sort', () => {
  it('sorts by score with unscored rows last in both directions', () => {
    const a = session({ score_overall: 80, created_at: '2026-10-01T10:00:00Z' });
    const b = session({ score_overall: 60, created_at: '2026-10-02T10:00:00Z' });
    const c = failed();
    const d = left();
    expect(sortSessions([c, a, d, b], 'score', 'desc').slice(0, 2)).toEqual([a, b]);
    expect(sortSessions([c, a, d, b], 'score', 'asc').slice(0, 2)).toEqual([b, a]);
  });

  it('sorts by when and length', () => {
    const a = session({ created_at: '2026-10-01T10:00:00Z', duration_seconds: 100 });
    const b = session({ created_at: '2026-10-03T10:00:00Z', duration_seconds: 50 });
    expect(sortSessions([a, b], 'when', 'desc')).toEqual([b, a]);
    expect(sortSessions([a, b], 'length', 'asc')).toEqual([b, a]);
  });
});

describe('sessionsCsv', () => {
  it('writes words and a blank score for a failed scoring, never 0', () => {
    const { header, rows } = sessionsCsv([failed()], { nameOf: () => 'Marie' });
    const col = (name: string) => rows[0][header.indexOf(name)];
    expect(header).not.toContain('Email');
    expect(col('Outcome')).toBe('Scoring failed');
    expect(col('Score')).toBeNull();
    expect(col('Acknowledge')).toBeNull();
    expect(col('Trainee')).toBe('Marie');
    expect(col('Mode')).toBe('Typed');
  });

  it('says who and the language; an anonymous row carries only its short device tag', () => {
    const anon = anonSession('4f2a9c1e-0000-4000-8000-000000000001', { locale: 'fr' });
    const rebuilt = rebuiltSession('4f2a9c1e-0000-4000-8000-000000000001', 'unknown');
    const { header, rows } = sessionsCsv([session({ locale: 'en' }), anon, rebuilt], {
      nameOf: () => 'Marie',
      emailOf: () => 'marie@example.com',
    });
    const col = (r: number, name: string) => rows[r][header.indexOf(name)];
    expect(header.slice(0, 6)).toEqual(['Date and time', 'Who', 'Trainee', 'Email', 'Language', 'Recorded as']);
    expect(col(0, 'Who')).toBe('Signed-in trainee');
    expect(col(0, 'Trainee')).toBe('Marie');
    expect(col(0, 'Language')).toBe('English');
    expect(col(0, 'Recorded as')).toBe('Saved by the app');
    expect(col(1, 'Who')).toBe(`Anonymous · Device ${deviceTag(anon.anon_session_id)}`);
    expect(col(1, 'Trainee')).toBe('');
    expect(col(1, 'Email')).toBe('');
    expect(col(1, 'Language')).toBe('Français');
    expect(col(2, 'Recorded as')).toBe('Rebuilt from app activity');
    expect(col(2, 'Outcome')).toBe('Ending not recorded');
    expect(col(2, 'Score')).toBeNull();
    expect(col(2, 'Animal')).toBe('');
    expect(col(2, 'Language')).toBe('Not recorded');
    expect(col(2, 'Messages')).toBeNull();
    // The full device id never leaves the portal.
    expect(JSON.stringify(rows)).not.toContain('4f2a9c1e-0000');
  });

  it('includes skills and email when allowed', () => {
    const { header, rows } = sessionsCsv([session({ score_overall: 77 })], {
      nameOf: () => 'Marie',
      emailOf: () => 'marie@example.com',
    });
    expect(header).toContain('Email');
    expect(rows[0][header.indexOf('Score')]).toBe(77);
    expect(rows[0][header.indexOf('Clarify')]).toBe(70);
    expect(rows[0][header.indexOf('Owner by the end')]).toBe('Won over');
    expect(rows[0][header.indexOf('Length (minutes)')]).toBe(5);
  });
});
