import { describe, expect, it } from 'vitest';
import { driverMatchup } from '../metrics';
import {
  feedbackSummary,
  hardestCell,
  hardestPairing,
  latestComments,
  moodSplit,
  objectionSkillTable,
  sentimentShift,
  sentimentWord,
  splitBy,
  teamObjectionTitles,
} from '../skills';
import { anonSession, rebuiltSession, session } from './fixtures';
import { LANGUAGE_NONE, languageKey, speciesOf } from '../who';

const label = (id: string) => `L:${id}`;
const skills = (v: number, transform = v) => ({ acknowledge: v, clarify: v, transform, empathy: v, rapport: v });

describe('objectionSkillTable', () => {
  it('averages each skill per objection, most practised first, and sets thin ones aside', () => {
    const rows = [
      session({ pushback_id: 'cost', score_overall: 80, skills: skills(80) }),
      session({ pushback_id: 'cost', score_overall: 70, skills: skills(70, 50) }),
      session({ pushback_id: 'cost', score_overall: 60, skills: null }),
      session({ pushback_id: 'raw-food', score_overall: 50, skills: skills(50) }),
      session({ pushback_id: 'raw-food', score_overall: 40, skills: skills(40) }),
      session({ pushback_id: 'rx-diet', score_overall: 90, skills: skills(90) }),
      // Never averaged: a failed scoring attempt and a session left early.
      session({ pushback_id: 'rx-diet', score_overall: 0, score_unavailable: true }),
      session({ pushback_id: 'rx-diet', completed: false, score_overall: null }),
      session({ pushback_id: null, score_overall: 75, skills: skills(75) }),
    ];
    const t = objectionSkillTable(rows, label);
    expect(t.rows.map((r) => [r.key, r.scored, r.withSkills, r.overall])).toEqual([
      ['cost', 3, 2, 70],
      ['raw-food', 2, 2, 45],
    ]);
    expect(t.rows[0].skills.transform).toBe(65);
    expect(t.rows[0].label).toBe('L:cost');
    expect(t.thin.map((x) => [x.key, x.scored]).sort()).toEqual([
      ['custom', 1],
      ['rx-diet', 1],
    ]);
  });

  it('names the hardest objection × skill cell with enough sessions', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => session({ pushback_id: 'cost', score_overall: 70, skills: skills(70, 52) })),
      ...Array.from({ length: 2 }, () => session({ pushback_id: 'raw-food', score_overall: 30, skills: skills(30) })),
    ];
    const t = objectionSkillTable(rows, label);
    expect(hardestCell(t.rows)).toEqual({ key: 'cost', label: 'L:cost', skill: 'transform', value: 52, sessions: 3 });
    expect(hardestCell(t.rows, 4)).toBeNull();
  });
});

describe('teamObjectionTitles', () => {
  it('takes the objection’s own title most sessions share, never a scenario title', () => {
    const rows = [
      // A Studio scenario on this objection is named by its card title — that
      // must never become the objection's name.
      session({ pushback_id: 'team:probiotic-doubt', objection_title: 'Doubts probiotics work', scenario_title: 'Senior lab, cost-sensitive owner' }),
      session({ pushback_id: 'team:probiotic-doubt', objection_title: 'Doubts probiotics work' }),
      session({ pushback_id: 'team:probiotic-doubt', objection_title: 'Old wording' }),
      session({ pushback_id: 'team:split', objection_title: 'One' }),
      session({ pushback_id: 'team:split', objection_title: 'Two' }),
      session({ pushback_id: 'cost', objection_title: 'Cost / price pushback' }),
    ];
    expect(teamObjectionTitles(rows)).toEqual([{ id: 'team:probiotic-doubt', title: 'Doubts probiotics work' }]);
  });
});

describe('hardestPairing', () => {
  it('finds the lowest-scoring style pairing with enough sessions', () => {
    const rows = [
      session({ user_id: 'an', owner_driver: 'Activator', score_overall: 50 }),
      session({ user_id: 'an', owner_driver: 'Activator', score_overall: 60 }),
      session({ user_id: 'an', owner_driver: 'Harmonizer', score_overall: 40 }),
      session({ user_id: 'ha', owner_driver: 'Activator', score_overall: 80 }),
      session({ user_id: 'ha', owner_driver: 'Activator', score_overall: 90 }),
    ];
    const m = driverMatchup(rows, (u) => (u === 'an' ? 'Analyzer' : 'Harmonizer'));
    expect(hardestPairing(m)).toEqual({ trainee: 'Analyzer', owner: 'Activator', avgScore: 55, scored: 2 });
    expect(hardestPairing(m, 3)).toBeNull();
  });
});

describe('splits and moods', () => {
  it('splits by a key in a fixed order, dropping empty groups', () => {
    const rows = [
      session({ species: 'cat', score_overall: 60 }),
      session({ species: 'dog', score_overall: 80 }),
      session({ species: 'dog', score_overall: 70 }),
    ];
    expect(splitBy(rows, (s) => s.species, ['dog', 'cat', 'bird'])).toEqual([
      { key: 'dog', sessions: 2, scored: 2, avgScore: 75 },
      { key: 'cat', sessions: 1, scored: 1, avgScore: 60 },
    ]);
  });

  it('splits by language and by who practised; rebuilt sessions count as sessions, never in an average or an animal', () => {
    const rows = [
      session({ locale: 'en', score_overall: 80 }),
      anonSession('d1', { locale: 'fr', score_overall: 60 }),
      anonSession('d2', { locale: 'fr', score_overall: 70 }),
      rebuiltSession('d3', 'finished'),
      rebuiltSession('d3', 'unknown'),
    ];
    expect(splitBy(rows, (s) => languageKey(s.locale), ['en', 'fr', LANGUAGE_NONE])).toEqual([
      { key: 'en', sessions: 1, scored: 1, avgScore: 80 },
      { key: 'fr', sessions: 2, scored: 2, avgScore: 65 },
      { key: LANGUAGE_NONE, sessions: 2, scored: 0, avgScore: null },
    ]);
    expect(splitBy(rows, (s) => (s.user_id ? 'signed_in' : 'anonymous'), ['signed_in', 'anonymous'])).toEqual([
      { key: 'signed_in', sessions: 1, scored: 1, avgScore: 80 },
      { key: 'anonymous', sessions: 4, scored: 2, avgScore: 65 },
    ]);
    // A rebuilt session's animal is unknown: left out, not guessed as a dog.
    expect(splitBy(rows, (s) => speciesOf(s), ['dog', 'cat'])).toEqual([{ key: 'dog', sessions: 3, scored: 3, avgScore: 70 }]);
  });

  it('counts how finished sessions ended', () => {
    expect(
      moodSplit([
        session({ owner_mood_end: 'green' }),
        session({ owner_mood_end: 'green' }),
        session({ owner_mood_end: 'red' }),
        session({ owner_mood_end: null }),
        session({ completed: false, owner_mood_end: 'yellow' }),
      ]),
    ).toEqual({ green: 2, yellow: 0, red: 1, total: 3 });
  });

  it('averages the owner’s sentiment at the start and end of scored sessions', () => {
    const s = sentimentShift([
      session({ owner_sentiment_start: -0.6, owner_sentiment_end: 0.2 }),
      session({ owner_sentiment_start: -0.2, owner_sentiment_end: 0.6 }),
      session({ owner_sentiment_start: null, owner_sentiment_end: 0.9 }),
      session({ score_unavailable: true, score_overall: 0, owner_sentiment_start: -1, owner_sentiment_end: -1 }),
    ]);
    expect(s.count).toBe(2);
    expect(s.start).toBeCloseTo(-0.4, 5);
    expect(s.end).toBeCloseTo(0.4, 5);
    expect(sentimentWord(-0.7)).toBe('upset');
    expect(sentimentWord(0)).toBe('neutral');
    expect(sentimentWord(0.7)).toBe('happy');
  });
});

describe('feedback', () => {
  it('averages 1–5 ratings, ignoring blanks and out-of-range values', () => {
    const f = feedbackSummary([
      { realism: 4, ai_quality: 5, comfort: null, comment: null, created_at: '2026-10-01' },
      { realism: 2, ai_quality: 9, comfort: 3, comment: 'ok', created_at: '2026-10-02' },
    ]);
    expect(f).toEqual({ count: 2, realism: 3, aiQuality: 5, comfort: 3 });
  });

  it('lists the newest comments, skipping blanks', () => {
    const rows = [
      { realism: 4, ai_quality: 4, comfort: 4, comment: 'first', created_at: '2026-10-01' },
      { realism: 4, ai_quality: 4, comfort: 4, comment: '  ', created_at: '2026-10-05' },
      { realism: 4, ai_quality: 4, comfort: 4, comment: 'third', created_at: '2026-10-03' },
    ];
    expect(latestComments(rows, 3).map((r) => r.comment)).toEqual(['third', 'first']);
  });
});
