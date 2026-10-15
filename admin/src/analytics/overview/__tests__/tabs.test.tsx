/**
 * Smoke tests for the Overview and Skills tabs: they render the story from
 * real lib numbers, never fire a request the viewer's role would 403, and
 * explain themselves when the role can't read sessions at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SessionSummary, TraineeDirectoryEntry } from '../../../../../src/shared/analytics/contract';
import { person, session } from '../../lib/__tests__/fixtures';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const q = <T,>(data: T) => ({ data, loading: false, refreshing: false, error: null, refetch: vi.fn(), updatedAt: Date.now() });

const state = {
  rows: [] as SessionSummary[],
  directory: [] as TraineeDirectoryEntry[],
};
const calls = {
  sessions: vi.fn(),
  ai: vi.fn(),
  reports: vi.fn(),
  feedback: vi.fn(),
};

vi.mock('../../data', () => ({
  useSessionSummaries: (range: string) => {
    calls.sessions(range);
    return q({ rows: state.rows, truncated: false });
  },
  useTraineeDirectory: () => q({ rows: state.directory, emails: false }),
  useAiCallsWindow: (_range: string, enabled: boolean) => {
    calls.ai(enabled);
    return q(enabled ? [{ created_at: ago(1), latency_ms: 1200, cost_usd: 0.01, error: null }] : []);
  },
  useOpenReports: (enabled: boolean) => {
    calls.reports(enabled);
    return q(enabled ? [{ id: 'r1', kind: 'bug', status: 'open', message: 'Scorecard spun forever.', created_at: ago(0.1) }] : []);
  },
  useFeedbackWindow: (_range: string, enabled: boolean) => {
    calls.feedback(enabled);
    return q(
      enabled
        ? [{ id: 'f1', session_id: null, user_id: 'a', anon_session_id: null, realism: 4, ai_quality: 5, comfort: 4, comment: 'Felt real.', scenario_summary: null, pushback_id: 'cost', created_at: ago(1) }]
        : [],
    );
  },
}));

// eslint-disable-next-line import/first
import { OverviewTab } from '../../OverviewTab';
import { SkillsTab } from '../../SkillsTab';
import { AccessProvider } from '../../../primitives/access';
import type { AnalyticsTabProps } from '../../AnalyticsDestination';

function props(over: Partial<AnalyticsTabProps> = {}): AnalyticsTabProps {
  return {
    range: '28d',
    onRange: vi.fn(),
    query: '',
    onQuery: vi.fn(),
    recordId: null,
    onOpen: vi.fn(),
    onNav: vi.fn(),
    ...over,
  };
}

function seed() {
  state.directory = [
    person({ user_id: 'a', display_name: 'Ann Active', echo_primary: 'Analyzer', created_at: ago(90) }),
    person({ user_id: 'b', display_name: 'Sam Slipping', echo_primary: 'Activator', created_at: ago(90) }),
    person({ user_id: 'c', display_name: 'Cy Never', echo_primary: 'Harmonizer', created_at: ago(30) }),
  ];
  state.rows = [
    ...Array.from({ length: 6 }, (_, i) =>
      session({ user_id: 'a', created_at: ago(1 + i), score_overall: 70 + i, pushback_id: 'cost', owner_driver: 'Activator' }),
    ),
    session({ user_id: 'a', created_at: ago(2), score_overall: 41, pushback_id: 'weight-denial', owner_driver: 'Activator' }),
    session({ user_id: 'a', created_at: ago(3), score_overall: 50, pushback_id: 'weight-denial', owner_driver: 'Activator' }),
    session({ user_id: 'b', created_at: ago(12), score_overall: 66 }),
    session({ user_id: 'b', created_at: ago(40), score_overall: 60 }),
  ];
}

beforeEach(() => {
  seed();
  Object.values(calls).forEach((c) => c.mockClear());
});

describe('OverviewTab', () => {
  it('tells the story and lists what needs attention', () => {
    render(
      <AccessProvider permissions={['overview.read', 'sessions.read', 'insights.read', 'reports.read', 'quality.read']}>
        <OverviewTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText(/In the last 28 days,/)).toBeInTheDocument();
    expect(screen.getByText('Needs your attention')).toBeInTheDocument();
    expect(screen.getByText('1 open problem report')).toBeInTheDocument();
    expect(screen.getByText('2 sessions scored under 55')).toBeInTheDocument();
    expect(screen.getByText('1 trainee is slipping')).toBeInTheDocument();
    expect(screen.getByText('1 person hasn’t started')).toBeInTheDocument();
    expect(screen.getByText('Trainees practising')).toBeInTheDocument();
    expect(screen.getByText('Getting started')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'AI health' })).toBeInTheDocument();
    expect(calls.sessions).toHaveBeenCalledWith('all');
  });

  it('never asks for AI calls or reports the role can’t read', () => {
    render(
      <AccessProvider permissions={['overview.read', 'sessions.read']}>
        <OverviewTab {...props()} />
      </AccessProvider>,
    );
    expect(calls.ai).toHaveBeenCalled();
    expect(calls.ai.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(calls.reports.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(screen.queryByText(/open problem report/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'AI health' })).not.toBeInTheDocument();
    expect(screen.queryByText('Open Skills →')).not.toBeInTheDocument();
  });

  it('explains itself instead of fetching when the role can’t read sessions', () => {
    render(
      <AccessProvider permissions={['overview.read']}>
        <OverviewTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText('Your role can’t read training sessions')).toBeInTheDocument();
    expect(calls.sessions).not.toHaveBeenCalled();
  });

  it('is honest about an empty window', () => {
    state.rows = [];
    render(
      <AccessProvider permissions={['overview.read', 'sessions.read']}>
        <OverviewTab {...props({ range: '7d' })} />
      </AccessProvider>,
    );
    expect(screen.getByText('No one has practised in the last 7 days yet.')).toBeInTheDocument();
    expect(screen.getByText('No practice in the last 7 days')).toBeInTheDocument();
  });
});

describe('SkillsTab', () => {
  it('names the hardest objection and shows feedback only with feedback.read', () => {
    render(
      <AccessProvider permissions={['insights.read', 'sessions.read']}>
        <SkillsTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText('Skill breakdown')).toBeInTheDocument();
    expect(screen.getByText('Objection × skill')).toBeInTheDocument();
    expect(screen.getByText(/Hardest spot:/)).toBeInTheDocument();
    expect(screen.getAllByText('Cost / price pushback').length).toBeGreaterThan(0);
    expect(screen.queryByText('What trainees said')).not.toBeInTheDocument();
    expect(calls.feedback.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
  });

  it('adds trainee feedback for a role that can read it', () => {
    render(
      <AccessProvider permissions={['insights.read', 'sessions.read', 'feedback.read']}>
        <SkillsTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText('What trainees said')).toBeInTheDocument();
    expect(screen.getByText('“Felt real.”')).toBeInTheDocument();
  });

  it('offers all time when the window has no scores', () => {
    state.rows = [];
    const onRange = vi.fn();
    render(
      <AccessProvider permissions={['insights.read', 'sessions.read']}>
        <SkillsTab {...props({ onRange })} />
      </AccessProvider>,
    );
    screen.getByText('Show all time').click();
    expect(onRange).toHaveBeenCalledWith('all');
  });
});
