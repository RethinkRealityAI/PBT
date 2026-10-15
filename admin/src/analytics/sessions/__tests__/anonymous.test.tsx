/**
 * Anonymous practice across the Analytics tabs: it is counted as sessions
 * (and its scores in averages) but never as a trainee; the Sessions tab can
 * pick it out; the Trainees roster points to it; Skills splits by language.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SessionSummary, TraineeDirectoryEntry } from '../../../../../src/shared/analytics/contract';
import { anonSession, person, rebuiltSession, session } from '../../lib/__tests__/fixtures';
import { deviceTag } from '../../lib/who';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const q = <T,>(data: T) => ({ data, loading: false, refreshing: false, error: null, errorStatus: null, refetch: vi.fn(), updatedAt: Date.now() });

const state = {
  rows: [] as SessionSummary[],
  directory: [] as TraineeDirectoryEntry[],
};

vi.mock('../../data', () => ({
  useSessionSummaries: () => q({ rows: state.rows, truncated: false }),
  useTraineeDirectory: () => q({ rows: state.directory, emails: false }),
  useEngagement: () => q(null),
  useSessionDetail: () => q(null),
  useAiCallsWindow: () => q([]),
  useOpenReports: () => q([]),
  useFeedbackWindow: () => q([]),
}));

// eslint-disable-next-line import/first
import { OverviewTab } from '../../OverviewTab';
import { SessionsTab } from '../../SessionsTab';
import { SkillsTab } from '../../SkillsTab';
import { TraineeRoster } from '../../trainee/TraineeRoster';
import { AccessProvider } from '../../../primitives/access';
import type { AnalyticsTabProps } from '../../AnalyticsDestination';
import { NO_FILTERS, clearSessionFilterPreset, sessionFilterPreset } from '../../lib/sessionsExplorer';

const PERMS = ['overview.read', 'sessions.read', 'insights.read'];

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

const DEV_A = '4f2a9c1e-0000-4000-8000-00000000000a';
const DEV_B = '4f2a9c1e-0000-4000-8000-00000000000b';

beforeEach(() => {
  clearSessionFilterPreset();
  state.directory = [
    person({ user_id: 'a', display_name: 'Ann Active', created_at: ago(90) }),
    person({ user_id: 'b', display_name: 'Ben Busy', created_at: ago(90) }),
  ];
  state.rows = [
    session({ user_id: 'a', created_at: ago(1), score_overall: 80, locale: 'en' }),
    session({ user_id: 'b', created_at: ago(2), score_overall: 70 }),
    anonSession(DEV_A, { created_at: ago(1), score_overall: 60, locale: 'fr' }),
    anonSession(DEV_A, { created_at: ago(2), score_overall: 50, locale: 'fr' }),
    rebuiltSession(DEV_B, 'unknown', { created_at: ago(14) }),
    rebuiltSession(DEV_B, 'finished', { created_at: ago(14) }),
  ];
});

describe('Overview with anonymous practice', () => {
  it('counts trainees and anonymous visitors apart', () => {
    render(
      <AccessProvider permissions={PERMS}>
        <OverviewTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getAllByText('2 trainees').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 anonymous visitors').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Signed-in people with at least one session · + 2 anonymous devices'),
    ).toBeInTheDocument();
    // The team's habit mix is the two signed-in people only.
    expect(screen.getByText(/Your team · 2 people/)).toBeInTheDocument();
    // Nobody called "A trainee" or "Unknown trainee" for a session without an account.
    expect(screen.queryByText(/Unknown trainee|A trainee on/)).toBeNull();
  });
});

describe('Sessions tab with anonymous practice', () => {
  it('names anonymous rows by device, marks rebuilt ones, and sums people honestly', () => {
    render(
      <AccessProvider permissions={PERMS}>
        <SessionsTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText('2 trainees · 2 anonymous devices')).toBeInTheDocument();
    expect(screen.getAllByText('Anonymous', { selector: 'span' }).length).toBe(4);
    expect(screen.getAllByText(`Device ${deviceTag(DEV_A)}`).length).toBe(2);
    expect(screen.getAllByText('Rebuilt').length).toBe(2);
    expect(screen.getByText('Ending not recorded', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Unknown trainee')).toBeNull();
  });

  it('opens on the filter another tab asked for — Who: Anonymous', () => {
    const roster = props();
    const { unmount } = render(
      <AccessProvider permissions={PERMS}>
        <TraineeRoster {...roster} />
      </AccessProvider>,
    );
    const note = screen.getByText(/were played without an account/);
    expect(note).toHaveTextContent('4 sessions in this window were played without an account');
    fireEvent.click(within(note).getByRole('button', { name: 'see Sessions → Who: Anonymous' }));
    expect(roster.onOpen).toHaveBeenCalledWith('sessions');
    expect(sessionFilterPreset()).toEqual({ ...NO_FILTERS, who: 'anonymous' });
    unmount();

    render(
      <AccessProvider permissions={PERMS}>
        <SessionsTab {...props()} />
      </AccessProvider>,
    );
    expect((screen.getByLabelText('Who') as HTMLSelectElement).value).toBe('anonymous');
    expect(screen.queryByText('Ann Active')).toBeNull();
    // Read once: the next visit starts clean.
    expect(sessionFilterPreset()).toEqual(NO_FILTERS);
  });

  it('filters by language', () => {
    render(
      <AccessProvider permissions={PERMS}>
        <SessionsTab {...props()} />
      </AccessProvider>,
    );
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'fr' } });
    expect(screen.getByText('1 anonymous device')).toBeInTheDocument();
    expect(screen.queryByText('Ann Active')).toBeNull();
  });
});

describe('Skills with anonymous practice', () => {
  it('splits scores by language and by who practised', () => {
    render(
      <AccessProvider permissions={PERMS}>
        <SkillsTab {...props()} />
      </AccessProvider>,
    );
    expect(screen.getByText('By language')).toBeInTheDocument();
    expect(screen.getByText('Français')).toBeInTheDocument();
    expect(screen.getByText('By who practised')).toBeInTheDocument();
    expect(screen.getByText('Signed-in trainees')).toBeInTheDocument();
    // Rebuilt sessions show in "of …" but never move an average.
    expect(screen.getByText(/2 scored of 4/)).toBeInTheDocument();
  });
});
