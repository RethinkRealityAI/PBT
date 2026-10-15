import { describe, expect, it } from 'vitest';
import { ADOPTION_FEATURES, biggestDrop, featureAdoption, onboardingFunnel } from '../engagementFeatures';

const screens = (list: Array<[string, number]>) => list.map(([screen, visitors]) => ({ screen, visitors, views: visitors * 3, dwell_ms: 0 }));
const actions = (list: Array<[string, number]>) => list.map(([action, visitors]) => ({ action, visitors, count: visitors * 2 }));

describe('featureAdoption', () => {
  it('reads screens and actions as distinct people, as a share of all visitors', () => {
    const rows = featureAdoption({
      current: { visitors: 20 },
      screens: screens([
        ['chat', 15],
        ['stats', 12],
        ['fecalScan', 2],
      ]),
      actions: actions([
        ['coach_hint_request', 5],
        ['library_scenario', 9],
      ]),
    });
    expect(rows).toHaveLength(ADOPTION_FEATURES.length);
    expect(rows[0]).toEqual({ key: 'training', label: 'Training sessions', people: 15, share: 75 });
    expect(rows.find((r) => r.key === 'library')?.people).toBe(9);
    expect(rows.find((r) => r.key === 'hints')?.share).toBe(25);
    // Unused features stay listed, at zero, at the bottom.
    expect(rows[rows.length - 1].people).toBe(0);
  });

  it('caps a feature at the visitor total and copes with no visitors', () => {
    expect(featureAdoption({ current: { visitors: 3 }, screens: screens([['chat', 9]]), actions: [] })[0].people).toBe(3);
    const none = featureAdoption({ current: { visitors: 0 }, screens: [], actions: [] });
    expect(none.every((r) => r.share === null && r.people === 0)).toBe(true);
  });

  it('sorts by reach, then by name', () => {
    const rows = featureAdoption({ current: { visitors: 10 }, screens: screens([['resources', 4], ['actGuide', 4]]), actions: [] });
    expect(rows.slice(0, 2).map((r) => r.label)).toEqual(['ACT guide', 'Resources']);
  });
});

describe('onboardingFunnel', () => {
  it('counts each step and the drop from the one before', () => {
    const steps = onboardingFunnel(
      screens([
        ['onboarding', 10],
        ['terms', 8],
        ['quiz', 8],
        ['result', 6],
        ['home', 30],
        ['chat', 20],
        ['stats', 18],
      ]),
    );
    expect(steps.map((s) => s.label)).toEqual(['Welcome', 'Terms', 'Quiz', 'Quiz result', 'Home', 'Training session', 'Scorecard']);
    expect(steps[0].change).toBeNull();
    expect(steps[1]).toMatchObject({ people: 8, change: -2, dropPct: 20 });
    expect(steps[2]).toMatchObject({ change: 0, dropPct: null });
    // Returning trainees go straight to Home: an increase, not a negative drop.
    expect(steps[4]).toMatchObject({ people: 30, change: 24, dropPct: null, ofMax: 100 });
    expect(biggestDrop(steps)?.label).toBe('Training session');
  });

  it('handles a window with no onboarding at all', () => {
    const steps = onboardingFunnel([]);
    expect(steps.every((s) => s.people === 0 && s.ofMax === null)).toBe(true);
    expect(biggestDrop(steps)).toBeNull();
  });
});
