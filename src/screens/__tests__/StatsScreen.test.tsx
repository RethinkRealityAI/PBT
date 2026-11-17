import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsScreen } from '../StatsScreen';
import { SEED_SCENARIOS, type Scenario } from '../../data/scenarios';
import type { ChatMessage, ScoreReport } from '../../services/types';

let chatState: {
  scoreReport: ScoreReport | null;
  sessionId: string | null;
  messages: ChatMessage[];
};
let currentScenario: Scenario | null;

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go: vi.fn(), back: vi.fn(), replace: vi.fn(), current: 'stats', history: [] }),
}));
vi.mock('../../app/providers/ChatProvider', () => ({
  useChat: () => ({ ...chatState, rescore: vi.fn(async () => false), reset: vi.fn() }),
}));
vi.mock('../../app/providers/ScenarioProvider', () => ({
  useScenario: () => ({ scenario: currentScenario, setScenario: vi.fn() }),
}));
vi.mock('../../shell/TopBar', () => ({
  TopBar: ({ title }: { title?: string }) => <div>{title}</div>,
}));
vi.mock('../../features/feedback/SessionFeedbackCard', () => ({ SessionFeedbackCard: () => null }));
vi.mock('../../lib/analytics', () => ({ logEvent: vi.fn() }));

const MESSAGES: ChatMessage[] = [
  { role: 'ai', text: 'This food costs a fortune.', timestamp: 1, emotion: 'red' },
  { role: 'user', text: 'It is a real cost — can I ask what matters most to you?', timestamp: 2 },
];

function report(overall: number, extra: Partial<ScoreReport> = {}): ScoreReport {
  return {
    acknowledge: overall,
    clarify: overall,
    transform: overall,
    empathy: overall,
    rapport: overall,
    overall,
    band: overall >= 80 ? 'good' : overall >= 60 ? 'ok' : 'poor',
    critique: 'Good acknowledgement.',
    betterAlternative: 'Ask what worries them most.',
    perDimensionNotes: { acknowledge: '', clarify: '', transform: '', empathy: '', rapport: '' },
    keyMoments: [],
    turnSentiment: [],
    ...extra,
  };
}

const combative: Scenario = { ...SEED_SCENARIOS[0], difficulty: 4 };

beforeEach(() => {
  chatState = { scoreReport: report(75), sessionId: 'sess-1', messages: MESSAGES };
  currentScenario = combative;
});

describe('StatsScreen — difficulty beside the overall score', () => {
  it('captions the level from the saved record', () => {
    localStorage.setItem(
      'pbt:sessions',
      JSON.stringify([
        {
          id: 'sess-1',
          scenarioSummary: 'Cost · Labrador',
          pushbackId: 'cost',
          driver: 'Analyzer',
          durationSeconds: 60,
          mode: 'text',
          scoreReport: report(75),
          transcript: MESSAGES,
          createdAt: '2026-10-12T15:00:00.000Z',
          difficulty: 3,
        },
      ]),
    );
    render(<StatsScreen />);
    // The record wins over the scenario on screen (4).
    expect(screen.getByRole('img', { name: 'Difficulty: Hostile, level 3 of 4' })).toHaveTextContent('Hostile');
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    // The score itself is unchanged by the level.
    expect(screen.getByRole('img', { name: /score 75 out of 100/i })).toBeInTheDocument();
  });

  it('falls back to the played scenario when no record was saved (admin preview)', () => {
    render(<StatsScreen />);
    expect(screen.getByRole('img', { name: 'Difficulty: Combative, level 4 of 4' })).toBeInTheDocument();
  });

  it('shows no level when neither the record nor the scenario has one', () => {
    currentScenario = null;
    render(<StatsScreen />);
    expect(screen.queryByRole('img', { name: /^Difficulty:/ })).toBeNull();
    expect(screen.queryByText('Difficulty')).toBeNull();
  });

  it('shows no level on the scoring-unavailable card', () => {
    chatState.scoreReport = { ...report(0), critique: 'Scoring unavailable.', scoreUnavailable: true };
    render(<StatsScreen />);
    expect(screen.getByRole('button', { name: /retry scoring/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Difficulty:/ })).toBeNull();
  });
});

describe('StatsScreen — "What excellent sounds like" is scenario-specific', () => {
  it("shows the scorer's line for the focus dimension", () => {
    chatState.scoreReport = report(75, {
      acknowledge: 40,
      excellentExamples: {
        acknowledge: 'It sounds like keeping Biscuit comfortable on a budget matters a lot to you.',
        clarify: 'What does he eat in a day right now?',
      },
    });
    render(<StatsScreen />);
    expect(screen.getByText('Focus next · Acknowledge')).toBeInTheDocument();
    expect(screen.getByText('What excellent sounds like')).toBeInTheDocument();
    expect(
      screen.getByText('It sounds like keeping Biscuit comfortable on a budget matters a lot to you.'),
    ).toBeInTheDocument();
  });

  it('hides the section instead of showing the generic rubric line', () => {
    chatState.scoreReport = report(75, { acknowledge: 40 });
    render(<StatsScreen />);
    expect(screen.getByText('Focus next · Acknowledge')).toBeInTheDocument();
    expect(screen.queryByText('What excellent sounds like')).toBeNull();
    // The old generic anchor (another dog, another objection) never appears.
    expect(screen.queryByText(/Bella means to you/)).toBeNull();
  });

  it('hides it when the line for the focus dimension is blank', () => {
    chatState.scoreReport = report(75, {
      acknowledge: 40,
      excellentExamples: { acknowledge: '  ', clarify: 'What does he eat in a day?' },
    });
    render(<StatsScreen />);
    expect(screen.queryByText('What excellent sounds like')).toBeNull();
  });
});
