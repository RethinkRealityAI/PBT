import { describe, expect, it } from 'vitest';
import { sessionStats } from '../metrics';
import { joinNames, narrativeText, overviewNarrative, priorWords, windowPhrase } from '../narrative';
import { session } from './fixtures';

function many(n: number, over: Parameters<typeof session>[0] = {}, users = 1) {
  return Array.from({ length: n }, (_, i) => session({ user_id: `u${(i % users) + 1}`, ...over }));
}

describe('overviewNarrative', () => {
  it('reads like the example: activity vs before, score vs before, weakest skill and improvers', () => {
    const current = sessionStats(many(112, { score_overall: 71 }, 14));
    const previous = sessionStats(many(100, { score_overall: 68 }, 12));
    const text = narrativeText(
      overviewNarrative({
        range: '28d',
        current,
        previous,
        weakestSkill: 'transform',
        skillSessions: 112,
        improvers: [
          { user_id: 'u10', name: 'Hana Sato', momentum: 9 },
          { user_id: 'u6', name: 'Alex Chen', momentum: 6 },
          { user_id: 'u2', name: 'Marie Tremblay', momentum: 2 },
        ],
      }),
    );
    expect(text).toBe(
      'In the last 28 days, 14 trainees practised 112 times — 12% more than the 28 days before. ' +
        'The team averages 71, up 3 points. ' +
        'Transform is the weakest skill; Hana Sato and Alex Chen improved most.',
    );
  });

  it('says fewer, down, and "about as often" honestly', () => {
    const prev = sessionStats(many(20, { score_overall: 75 }, 4));
    const fewer = narrativeText(
      overviewNarrative({
        range: '7d',
        current: sessionStats(many(10, { score_overall: 70 }, 3)),
        previous: prev,
        weakestSkill: null,
        skillSessions: 0,
        improvers: [],
      }),
    );
    expect(fewer).toBe('In the last 7 days, 3 trainees practised 10 times — 50% fewer than the 7 days before. The team averages 70, down 5 points.');

    const same = narrativeText(
      overviewNarrative({
        range: '7d',
        current: sessionStats(many(20, { score_overall: 75 }, 4)),
        previous: prev,
        weakestSkill: null,
        skillSessions: 0,
        improvers: [],
      }),
    );
    expect(same).toContain('about as often as the 7 days before');
    expect(same).toContain('The team averages 75, the same as before.');
  });

  it('is honest when nobody practised', () => {
    const empty = sessionStats([]);
    expect(
      narrativeText(
        overviewNarrative({ range: '7d', current: empty, previous: empty, weakestSkill: null, skillSessions: 0, improvers: [] }),
      ),
    ).toBe('No one has practised in the last 7 days yet.');
    expect(
      narrativeText(
        overviewNarrative({
          range: '7d',
          current: empty,
          previous: sessionStats(many(12)),
          weakestSkill: 'clarify',
          skillSessions: 0,
          improvers: [],
        }),
      ),
    ).toBe('No one has practised in the last 7 days yet. The 7 days before had 12 sessions.');
    expect(
      narrativeText(
        overviewNarrative({ range: 'all', current: empty, previous: null, weakestSkill: null, skillSessions: 0, improvers: [] }),
      ),
    ).toBe('No one has practised yet.');
  });

  it('never compares on "all time", and words the count for one person and one session', () => {
    const text = narrativeText(
      overviewNarrative({
        range: 'all',
        current: sessionStats([session({ score_overall: 64 })]),
        previous: sessionStats(many(9)),
        weakestSkill: 'transform',
        skillSessions: 1,
        improvers: [],
      }),
    );
    expect(text).toBe('So far, 1 trainee has practised once. The team averages 64 across just 1 scored session.');
    expect(text).not.toContain('before');
    // One scored session is too thin to name a weakest skill.
    expect(text).not.toContain('weakest');
  });

  it('says when sessions exist but none was scored', () => {
    const left = sessionStats(many(3, { completed: false, score_overall: null }));
    expect(
      narrativeText(overviewNarrative({ range: '28d', current: left, previous: null, weakestSkill: null, skillSessions: 0, improvers: [] })),
    ).toBe('In the last 28 days, 1 trainee practised 3 times. None of them was finished, so there are no scores yet.');
    const failed = sessionStats([session({ score_unavailable: true, score_overall: 0 })]);
    expect(
      narrativeText(overviewNarrative({ range: '28d', current: failed, previous: null, weakestSkill: null, skillSessions: 0, improvers: [] })),
    ).toBe('In the last 28 days, 1 trainee practised once. It hasn’t been scored yet.');
  });

  it('mentions growth from an empty previous window without a percentage', () => {
    const text = narrativeText(
      overviewNarrative({
        range: '24h',
        current: sessionStats(many(2)),
        previous: sessionStats([]),
        weakestSkill: null,
        skillSessions: 0,
        improvers: [],
      }),
    );
    expect(text).toContain('practised twice — up from none in the day before.');
  });

  it('names only positive movers, and a lone improver without a skill', () => {
    const text = narrativeText(
      overviewNarrative({
        range: '28d',
        current: sessionStats(many(6)),
        previous: null,
        weakestSkill: 'clarify',
        skillSessions: 2,
        improvers: [
          { user_id: 'a', name: 'Ava Thompson', momentum: 5 },
          { user_id: 'b', name: 'Ben Morales', momentum: -4 },
        ],
      }),
    );
    expect(text.endsWith('Ava Thompson improved most.')).toBe(true);
    expect(text).not.toContain('Ben');
  });

  it('marks figures as strong and names as profile links', () => {
    const sentences = overviewNarrative({
      range: '28d',
      current: sessionStats(many(5)),
      previous: null,
      weakestSkill: 'empathy',
      skillSessions: 5,
      improvers: [{ user_id: 'u9', name: 'Zoe Martin', momentum: 3 }],
    });
    const segs = sentences.flat().filter((s) => typeof s !== 'string');
    expect(segs).toContainEqual({ text: 'Empathy', strong: true });
    expect(segs).toContainEqual({ text: 'Zoe Martin', userId: 'u9' });
  });
});

describe('helpers', () => {
  it('words windows', () => {
    expect(windowPhrase('24h')).toBe('In the last 24 hours');
    expect(windowPhrase('all')).toBe('So far');
    expect(priorWords('90d')).toBe('the 90 days before');
    expect(priorWords('all')).toBe('');
  });

  it('joins names in English', () => {
    const t = (xs: string[]) => joinNames(xs, (x) => x).join('');
    expect(t(['A'])).toBe('A');
    expect(t(['A', 'B'])).toBe('A and B');
    expect(t(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
