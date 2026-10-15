/**
 * Session feedback says who left each rating — a trainee's name when signed
 * in, "Anonymous" with a device tag otherwise (the normal case) — and opens
 * the rated session in Analytics → Sessions when the viewer can.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionFeedbackRow } from '../../data/types';
import { person, session } from '../../analytics/lib/__tests__/fixtures';
import { deviceTag } from '../../analytics/lib/who';

const q = <T,>(data: T) => ({ data, loading: false, refreshing: false, error: null, refetch: vi.fn(), updatedAt: Date.now() });

const rows: SessionFeedbackRow[] = [
  {
    id: 'f1',
    session_id: 's-open',
    user_id: null,
    anon_session_id: 'dev-anon-1',
    realism: 4,
    ai_quality: 5,
    comfort: 3,
    comment: 'Très réaliste.',
    scenario_summary: null,
    pushback_id: 'cost',
    created_at: new Date().toISOString(),
  },
  {
    id: 'f2',
    session_id: 's-gone',
    user_id: 'u1',
    anon_session_id: null,
    realism: 3,
    ai_quality: 3,
    comfort: 3,
    comment: null,
    scenario_summary: 'Beagle · Cost',
    pushback_id: 'cost',
    created_at: new Date().toISOString(),
  },
];

const calls = { summaries: vi.fn(), directory: vi.fn() };

vi.mock('../../data/queries', () => ({
  useSessionFeedback: () => ({ data: rows, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../analytics/data', () => ({
  useSessionSummaries: (_range: string, opts: { enabled?: boolean }) => {
    calls.summaries(opts.enabled);
    return q({ rows: opts.enabled ? [session({ id: 's-open' })] : [], truncated: false });
  },
  useTraineeDirectory: (enabled: boolean) => {
    calls.directory(enabled);
    return q({ rows: enabled ? [person({ user_id: 'u1', display_name: 'Marie Tremblay' })] : [], emails: false });
  },
}));

// eslint-disable-next-line import/first
import { FeedbackScreen } from '../FeedbackScreen';
import { AccessProvider } from '../../primitives/access';

function renderAs(permissions: string[]) {
  return render(
    <AccessProvider permissions={permissions}>
      <FeedbackScreen range="28d" onRange={() => {}} query="" onQuery={() => {}} />
    </AccessProvider>,
  );
}

beforeEach(() => {
  calls.summaries.mockClear();
  calls.directory.mockClear();
  window.location.hash = '';
});

describe('FeedbackScreen', () => {
  it('says who left each rating, and opens the session when it can', () => {
    renderAs(['feedback.read', 'sessions.read']);
    expect(screen.getByText('Who')).toBeInTheDocument();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.getByText(`Device ${deviceTag('dev-anon-1')}`)).toBeInTheDocument();
    expect(screen.getByText('Marie Tremblay')).toBeInTheDocument();
    // Only the session the viewer can open gets a link.
    const links = screen.getAllByRole('button', { name: 'Open session →' });
    expect(links).toHaveLength(1);
    fireEvent.click(links[0]);
    expect(window.location.hash).toBe('#/analytics/sessions/s-open');
    expect(screen.getByText(/1 of 2 ratings came from people practising without an account/)).toBeInTheDocument();
  });

  it('without session access: no names, no links, no session reads — still says signed in or anonymous', () => {
    renderAs(['feedback.read']);
    expect(calls.summaries.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(calls.directory.mock.calls.every(([enabled]) => enabled === false)).toBe(true);
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.getByText('Signed-in trainee')).toBeInTheDocument();
    expect(screen.queryByText('Marie Tremblay')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open session →' })).toBeNull();
  });
});
