/**
 * Smoke test for Analytics → ECHO: the seeded mock rows (scored with the
 * shared rule) render; the "click A" workshop is flagged and left out of the
 * counts by default; the include toggle brings it back; review buttons only
 * appear for a reviewer; the history note says visits, not results.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { EchoReport, TraineeDirectoryEntry } from '../../../../../src/shared/analytics/contract';
import { buildEchoRows } from '../../../dev/mockEcho';

const q = <T,>(data: T) => ({ data, loading: false, refreshing: false, error: null, errorStatus: null, refetch: vi.fn(), updatedAt: Date.now() });

const NOW = Date.now();
const people: TraineeDirectoryEntry[] = [
  { user_id: 'u1', display_name: 'Riley', echo_primary: 'Analyzer', echo_secondary: 'Harmonizer', created_at: new Date(NOW - 40 * 864e5).toISOString(), locale: 'en', disabled: false, admin_role: null, email: null, last_sign_in_at: null },
  { user_id: 'u2', display_name: 'Ada Admin', echo_primary: 'Activator', echo_secondary: 'Analyzer', created_at: new Date(NOW - 40 * 864e5).toISOString(), locale: 'en', disabled: false, admin_role: 'admin', email: null, last_sign_in_at: null },
];
const devices = Array.from({ length: 20 }, (_, i) => ({ id: `device-${String(i).padStart(4, '0')}-abcdef`, locale: i % 3 ? 'fr' : 'en' }));
const state: { report: EchoReport } = {
  report: { rows: buildEchoRows(people, devices, NOW), truncated: false, recording_since: new Date(NOW - 10 * 864e5).toISOString(), history: { before: new Date(NOW - 10 * 864e5).toISOString(), visits: 286, under_30s: 105 }, can_review: false },
};

vi.mock('../../data', () => ({
  useEchoReport: () => q(state.report),
  useTraineeDirectory: () => q({ rows: people, emails: false }),
}));

import { EchoTab } from '../../EchoTab';
import { resetEchoOptions } from '../../echoSettings';
import { AccessProvider } from '../../../primitives/access';

function renderTab() {
  return render(
    <AccessProvider permissions={['insights.read']}>
      <EchoTab range="28d" onRange={vi.fn()} query="" onQuery={vi.fn()} recordId={null} onOpen={vi.fn()} onNav={vi.fn()} />
    </AccessProvider>,
  );
}

afterEach(() => resetEchoOptions());

describe('EchoTab', () => {
  it('flags the workshop and leaves it out by default', () => {
    renderTab();
    expect(screen.getByRole('heading', { name: 'Data quality' })).toBeInTheDocument();
    const status = screen.getByRole('status', { name: '' });
    expect(status.textContent).toMatch(/quizzes in view are counted — left out: \d+ flagged by the rules/);
    expect(screen.getAllByText('Straight-lined').length).toBeGreaterThan(0);
    expect(screen.getByText(/these are screen visits, not quiz results/)).toBeInTheDocument();
    // No reviewer permission → no review buttons.
    expect(screen.queryByRole('button', { name: 'Exclude' })).not.toBeInTheDocument();
  });

  it('counts flagged quizzes once the toggle is on', () => {
    renderTab();
    const before = screen.getByRole('status', { name: '' }).textContent ?? '';
    fireEvent.click(screen.getByLabelText('Include flagged quizzes'));
    const after = screen.getByRole('status', { name: '' }).textContent ?? '';
    const counted = (t: string) => Number((/^(\d+) of/.exec(t) ?? [])[1]);
    expect(counted(after)).toBeGreaterThan(counted(before));
  });

  it('offers Include / Exclude / Reset to a reviewer and expands a quiz', () => {
    state.report = { ...state.report, can_review: true };
    renderTab();
    expect(screen.getAllByRole('button', { name: 'Exclude' }).length).toBeGreaterThan(0);
    const first = screen.getAllByRole('button', { expanded: false })[0];
    fireEvent.click(first);
    expect(screen.getByLabelText('Review note')).toBeInTheDocument();
    const table = screen.getAllByRole('table').at(-1) as HTMLElement;
    expect(within(table).getAllByText(/Q\d+|backfilled profile/i).length).toBeGreaterThan(0);
  });
});
