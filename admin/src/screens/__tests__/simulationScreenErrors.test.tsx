/**
 * The Simulation screen's blocking read-error state.
 *
 * The config GET failing used to leave the editor on the `{}` fallback: every
 * field showed its code default, indistinguishable from "nothing is
 * customised" — and one Save wrote those defaults over the whole live config.
 * Nothing may be editable until the real config has loaded.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const snapshot = {
  data: { config: {} as Record<string, unknown>, updated_at: null as string | null },
  loading: false,
  error: null as string | null,
};

vi.mock('../../data/queries', () => ({
  useAdminSimulationConfig: () => snapshot,
}));

// eslint-disable-next-line import/first
import { SimulationScreen } from '../SimulationScreen';
import { AccessProvider } from '../../primitives/access';

function renderScreen(permissions: string[] = ['simulation.read', 'simulation.write']) {
  return render(
    <AccessProvider permissions={permissions}>
      <SimulationScreen />
    </AccessProvider>,
  );
}

describe('SimulationScreen read errors', () => {
  it('renders the editor when the config loads', () => {
    snapshot.error = null;
    renderScreen();
    expect(screen.getByText('Save changes')).toBeInTheDocument();
    expect(screen.getByText('Scoring rubric')).toBeInTheDocument();
  });

  it('blocks editing when the config read fails', () => {
    snapshot.error = 'Request failed (500)';
    renderScreen();
    expect(
      screen.getByText('Couldn’t load the simulation settings'),
    ).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    // No draft, so nothing to save over the live config with.
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset all to defaults')).not.toBeInTheDocument();
  });

  it('hides the write controls without simulation.write', () => {
    snapshot.error = null;
    renderScreen(['simulation.read']);
    expect(screen.queryByText('Save changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Reset all to defaults')).not.toBeInTheDocument();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
