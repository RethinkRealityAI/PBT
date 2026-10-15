import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SessionModal } from '../../../screens/SessionModal';
import type { AdminSession } from '../../../data/types';

function adminSession(over: Partial<AdminSession> = {}): AdminSession {
  return {
    id: '5e550000-0000-4000-8000-000000000001',
    user_id: 'u1',
    scenario: {
      breed: 'Beagle',
      persona: 'Skeptical',
      difficulty: 3,
      pushback: { id: 'cost', title: 'Cost / price pushback' },
      _overrideId: 'admin:7c1d',
      title: 'Senior lab, cost-sensitive owner',
    },
    scenario_summary: 'Beagle · Cost / price pushback',
    pushback_id: 'cost',
    driver: 'Analyzer',
    transcript: [
      { role: 'ai', text: 'This costs twice what I pay.', timestamp: 1_000 },
      { role: 'user', text: 'I hear you, price matters.', timestamp: 21_000 },
    ],
    score_report: { acknowledge: 80, clarify: 70, transform: 60, empathy: 75, rapport: 70, overall: 72, band: 'ok' },
    score_overall: 72,
    score_unavailable: false,
    difficulty: 3,
    duration_seconds: 252,
    mode: 'text',
    completed: true,
    ended_reason: 'completed',
    flagged: false,
    flag_reason: null,
    model_id: 'gemini-3-flash-preview',
    turns: 2,
    created_at: new Date().toISOString(),
    ...over,
  };
}

const directoryUser = { user_id: 'u1', display_name: 'Marie Tremblay', echo_primary: 'Harmonizer', email: null };

describe('SessionModal', () => {
  it('renders nothing without a session, loading or error (People call site)', () => {
    const { container } = render(<SessionModal session={null} user={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens on a skeleton while the session loads', () => {
    render(<SessionModal session={null} user={null} loading onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Loading session' })).toBeInTheDocument();
    expect(screen.getByText('Loading the session…')).toBeInTheDocument();
  });

  it('shows a load failure with Try again', () => {
    const retry = vi.fn();
    render(<SessionModal session={null} user={null} error="Server error" onRetry={retry} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('accepts a directory entry as the user and links to the profile', () => {
    const onView = vi.fn();
    render(<SessionModal session={adminSession()} user={directoryUser} onClose={() => {}} onViewTrainee={onView} />);
    expect(screen.getByText('Marie Tremblay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Senior lab, cost-sensitive owner' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View trainee profile/ }));
    expect(onView).toHaveBeenCalledWith('u1');
    // Derived facts, in words.
    expect(screen.getByText('Scenario Studio')).toBeInTheDocument();
    expect(screen.getByText('Reply time')).toBeInTheDocument();
  });

  it('never shows a failed scoring as a score of 0', () => {
    render(
      <SessionModal
        session={adminSession({ score_unavailable: true, score_overall: 0, score_report: { overall: 0, scoreUnavailable: true } })}
        user={directoryUser}
        onClose={() => {}}
      />,
    );
    expect(screen.getAllByText('Scoring failed').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('labels how a session ended in words, never the raw reason', () => {
    render(
      <SessionModal
        session={adminSession({ completed: false, ended_reason: 'user_exit', score_report: null, score_overall: null })}
        user={directoryUser}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/user_exit/)).toBeNull();
    expect(screen.getAllByText('Left early').length).toBeGreaterThan(0);
  });
});
