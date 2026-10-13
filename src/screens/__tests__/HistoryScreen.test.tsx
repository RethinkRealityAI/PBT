import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryScreen } from '../HistoryScreen';
import { HistoryDetailScreen } from '../HistoryDetailScreen';
import { setSelectedSessionId } from '../../lib/selectedSession';
import type { ScoreReport, SessionRecord } from '../../services/types';

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go: vi.fn(), back: vi.fn(), replace: vi.fn(), current: 'history', history: [] }),
}));
vi.mock('../../shell/TopBar', () => ({
  TopBar: ({ title }: { title?: string }) => <div>{title}</div>,
}));
vi.mock('../../features/feedback/SessionFeedbackCard', () => ({ SessionFeedbackCard: () => null }));

function report(overall: number, extra: Partial<ScoreReport> = {}): ScoreReport {
  return {
    acknowledge: overall,
    clarify: overall,
    transform: overall,
    empathy: overall,
    rapport: overall,
    overall,
    band: overall >= 80 ? 'good' : overall >= 60 ? 'ok' : 'poor',
    critique: 'Good acknowledgement; clarify earlier.',
    betterAlternative: 'Ask what worries them most about the price.',
    perDimensionNotes: { acknowledge: '', clarify: '', transform: '', empathy: '', rapport: '' },
    keyMoments: [],
    turnSentiment: [],
    ...extra,
  };
}

const UNAVAILABLE: ScoreReport = {
  ...report(0),
  band: 'poor',
  critique: 'Scoring unavailable.',
  betterAlternative: '—',
  scoreUnavailable: true,
};

function record(id: string, scoreReport: ScoreReport, difficulty?: 1 | 2 | 3 | 4): SessionRecord {
  return {
    id,
    scenarioSummary: 'Cost / price pushback · Labrador',
    pushbackId: 'cost',
    driver: 'Analyzer',
    durationSeconds: 240,
    mode: 'text',
    scoreReport,
    transcript: [
      { role: 'ai', text: 'Why is this food so expensive?', timestamp: 1 },
      { role: 'user', text: 'I hear you — it is a real cost.', timestamp: 2 },
    ],
    createdAt: '2026-10-12T15:00:00.000Z',
    ...(difficulty ? { difficulty } : {}),
  };
}

function seed(sessions: SessionRecord[]) {
  localStorage.setItem('pbt:sessions', JSON.stringify(sessions));
}

beforeEach(() => {
  setSelectedSessionId(null);
});

describe('HistoryScreen — difficulty beside the score', () => {
  it('shows the meter + word under a scored session, nothing for an old record or an unscored one', () => {
    seed([
      record('hard', report(75), 4),
      record('legacy', report(60)), // saved before difficulty was stored
      record('failed', UNAVAILABLE, 3), // scoring outage — no score to qualify
    ]);
    render(<HistoryScreen />);

    const meters = screen.getAllByRole('img', { name: /^Difficulty:/ });
    expect(meters).toHaveLength(1);
    expect(meters[0]).toHaveAccessibleName('Difficulty: Combative, level 4 of 4');
    expect(meters[0]).toHaveTextContent('Combative');
    expect(meters[0].querySelectorAll('[data-filled="true"]')).toHaveLength(4);

    // The unscored row keeps its plain "—", with no level beside it.
    expect(screen.queryByRole('img', { name: /level 3 of 4/ })).toBeNull();
    expect(screen.getByLabelText('Not scored')).toBeInTheDocument();

    // Scores and the average are untouched: (75 + 60) / 2, unscored excluded.
    expect(screen.getByRole('img', { name: 'Score 75' })).toBeInTheDocument();
    expect(screen.getByText(/68% avg score/)).toBeInTheDocument();
  });

  it('ignores a corrupt stored level instead of drawing a wrong one', () => {
    seed([{ ...record('bad', report(70)), difficulty: 7 as unknown as 4 }]);
    render(<HistoryScreen />);
    expect(screen.queryByRole('img', { name: /^Difficulty:/ })).toBeNull();
    expect(screen.getByRole('img', { name: 'Score 70' })).toBeInTheDocument();
  });
});

describe('HistoryDetailScreen — difficulty near the overall score', () => {
  it('captions the level in the score card', () => {
    seed([record('s1', report(82), 2)]);
    setSelectedSessionId('s1');
    render(<HistoryDetailScreen />);
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Difficulty: Skeptical, level 2 of 4' }),
    ).toHaveTextContent('Skeptical');
    expect(screen.getByRole('img', { name: /score 82 out of 100/i })).toBeInTheDocument();
  });

  it('shows nothing for a record saved before difficulty was stored', () => {
    seed([record('s2', report(82))]);
    setSelectedSessionId('s2');
    render(<HistoryDetailScreen />);
    expect(screen.queryByText('Difficulty')).toBeNull();
    expect(screen.queryByRole('img', { name: /^Difficulty:/ })).toBeNull();
  });

  it('shows no level on the not-scored card', () => {
    seed([record('s3', UNAVAILABLE, 4)]);
    setSelectedSessionId('s3');
    render(<HistoryDetailScreen />);
    expect(screen.getAllByText('Not scored').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /^Difficulty:/ })).toBeNull();
  });
});
