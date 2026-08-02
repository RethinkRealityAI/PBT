import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionFeedbackCard } from '../SessionFeedbackCard';
import { markSessionRated } from '../useSessionFeedback';

describe('SessionFeedbackCard', () => {
  it('renders the rating form for an unrated session', () => {
    render(<SessionFeedbackCard sessionId="sess-new" />);
    expect(screen.getByText('Rate this simulation')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Scenario realism' })).toBeInTheDocument();
  });

  it('renders the compact already-rated state instead of the form', () => {
    markSessionRated('sess-old');
    render(<SessionFeedbackCard sessionId="sess-old" />);
    expect(screen.getByText(/already rated this session/i)).toBeInTheDocument();
    expect(screen.queryByText('Rate this simulation')).not.toBeInTheDocument();
  });

  it('still shows the form when no session id is known', () => {
    render(<SessionFeedbackCard />);
    expect(screen.getByText('Rate this simulation')).toBeInTheDocument();
  });
});
