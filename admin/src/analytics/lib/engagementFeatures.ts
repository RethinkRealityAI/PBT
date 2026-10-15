/**
 * Feature adoption and the onboarding path, from the server-aggregated
 * `EngagementReport` (every event in the window, distinct visitors per screen
 * and per action). Pure; unit-tested in `__tests__/engagementFeatures.test.ts`.
 *
 * Both read DISTINCT VISITORS — a person who opened the scorecard ten times
 * counts once — so a share is "how many of the people using the app tried
 * this", not "how busy was this screen".
 */
import type { EngagementReport } from '../../../../src/shared/analytics/contract';

export interface FeatureDef {
  key: string;
  label: string;
  /** Read from `screens[]` (a screen key) or `actions[]` (an event target). */
  from: 'screen' | 'action';
  id: string;
}

/** The trainee app's features, in the words a practice manager uses. */
export const ADOPTION_FEATURES: readonly FeatureDef[] = [
  { key: 'training', label: 'Training sessions', from: 'screen', id: 'chat' },
  { key: 'scorecard', label: 'Session scorecard', from: 'screen', id: 'stats' },
  { key: 'history', label: 'Past sessions', from: 'screen', id: 'history' },
  { key: 'create', label: 'Build a scenario', from: 'screen', id: 'create' },
  { key: 'library', label: 'Ready-made library', from: 'action', id: 'library_scenario' },
  { key: 'hints', label: 'Coach hints', from: 'action', id: 'coach_hint_request' },
  { key: 'act', label: 'ACT guide', from: 'screen', id: 'actGuide' },
  { key: 'resources', label: 'Resources', from: 'screen', id: 'resources' },
  { key: 'analyzer', label: 'Pet analyzer', from: 'screen', id: 'analyzer' },
  { key: 'fecal', label: 'Fecal scan', from: 'screen', id: 'fecalScan' },
];

export interface FeatureAdoption {
  key: string;
  label: string;
  /** Distinct people who used it in the window. */
  people: number;
  /** Share of everyone using the app in the window, 0–100; null with no visitors. */
  share: number | null;
}

type AdoptionInput = Pick<EngagementReport, 'screens' | 'actions'> & { current: { visitors: number } };

/** Every feature with its reach, most-used first (ties by name). Unused features stay, at 0. */
export function featureAdoption(report: AdoptionInput, features: readonly FeatureDef[] = ADOPTION_FEATURES): FeatureAdoption[] {
  const screens = new Map(report.screens.map((s) => [s.screen, s.visitors]));
  const actions = new Map(report.actions.map((a) => [a.action, a.visitors]));
  const total = report.current.visitors;
  return features
    .map((f) => {
      const raw = (f.from === 'screen' ? screens.get(f.id) : actions.get(f.id)) ?? 0;
      // A feature can't reach more people than used the app at all.
      const people = total > 0 ? Math.min(raw, total) : raw;
      return { key: f.key, label: f.label, people, share: total > 0 ? (people / total) * 100 : null };
    })
    .sort((a, b) => b.people - a.people || a.label.localeCompare(b.label));
}

// ─── Onboarding path ───────────────────────────────────────────────────

export const ONBOARDING_STEPS: ReadonlyArray<{ screen: string; label: string }> = [
  { screen: 'onboarding', label: 'Welcome' },
  { screen: 'terms', label: 'Terms' },
  { screen: 'quiz', label: 'Quiz' },
  { screen: 'result', label: 'Quiz result' },
  { screen: 'home', label: 'Home' },
  { screen: 'chat', label: 'Training session' },
  { screen: 'stats', label: 'Scorecard' },
];

export interface FunnelStep {
  screen: string;
  label: string;
  /** Distinct people who reached this screen in the window. */
  people: number;
  /** Share of the largest step, 0–100 (the bar length); null when nobody reached any. */
  ofMax: number | null;
  /**
   * Change from the step before: negative = people who didn't reach this one,
   * positive = more people here than the step before (people who'd already
   * onboarded before the window). Null on the first step.
   */
  change: number | null;
  /** The drop as a share of the step before (0–100), only when people were lost. */
  dropPct: number | null;
}

/**
 * Distinct visitors per onboarding step. Not a strict sequence — a returning
 * trainee goes straight to Home — so a later step can be larger; the change
 * says so instead of drawing a negative drop.
 */
export function onboardingFunnel(
  screens: EngagementReport['screens'],
  steps: ReadonlyArray<{ screen: string; label: string }> = ONBOARDING_STEPS,
): FunnelStep[] {
  const by = new Map(screens.map((s) => [s.screen, s.visitors]));
  const people = steps.map((s) => by.get(s.screen) ?? 0);
  const max = Math.max(0, ...people);
  return steps.map((s, i) => {
    const n = people[i];
    const prev = i > 0 ? people[i - 1] : null;
    const change = prev == null ? null : n - prev;
    return {
      screen: s.screen,
      label: s.label,
      people: n,
      ofMax: max > 0 ? (n / max) * 100 : null,
      change,
      dropPct: prev != null && prev > 0 && change != null && change < 0 ? (-change / prev) * 100 : null,
    };
  });
}

/** The biggest loss between two steps, for the panel's one-line takeaway. */
export function biggestDrop(steps: readonly FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null;
  for (const s of steps) {
    if (s.change == null || s.change >= 0) continue;
    if (!worst || (s.change as number) < (worst.change as number)) worst = s;
  }
  return worst;
}
