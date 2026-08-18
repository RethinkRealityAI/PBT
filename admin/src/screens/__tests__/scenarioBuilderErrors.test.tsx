/**
 * The Scenario Builder's blocking read-error state.
 *
 * This is the one behaviour that has to hold no matter how the screen is
 * refactored: when the override rows fail to load, the manifest alone still
 * renders three library scenarios. Listing them would tell the admin "0 of 3
 * have overrides" — and saving from that editor writes null over override rows
 * nobody ever read.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = {
  overrides: { data: [] as unknown[], loading: false, error: null as string | null },
  userScenarios: { data: [] as unknown[], loading: false, error: null as string | null },
};

vi.mock('../../data/queries', () => ({
  useScenarioOverrides: () => state.overrides,
  useUserScenarios: () => state.userScenarios,
  useKnowledgeDocuments: () => ({ data: [], loading: false, error: null }),
  upsertScenarioOverride: vi.fn(),
  deleteScenarioOverride: vi.fn(),
  duplicateScenario: vi.fn(),
}));

// eslint-disable-next-line import/first
import { ScenarioBuilderScreen } from '../ScenarioBuilderScreen';
import { AccessProvider } from '../../primitives/access';

function renderScreen(permissions: string[] = ['scenarios.read', 'scenarios.write']) {
  return render(
    <AccessProvider permissions={permissions}>
      <ScenarioBuilderScreen query="" onQuery={() => {}} />
    </AccessProvider>,
  );
}

describe('ScenarioBuilderScreen read errors', () => {
  it('lists the library scenarios when both reads succeed', () => {
    state.overrides = { data: [], loading: false, error: null };
    state.userScenarios = { data: [], loading: false, error: null };
    renderScreen();
    expect(screen.getByText('Weight / obesity denial')).toBeInTheDocument();
    expect(screen.getByText('+ New scenario')).toBeInTheDocument();
  });

  it('blocks the list when the override read fails', () => {
    state.overrides = { data: [], loading: false, error: 'Request failed (500)' };
    state.userScenarios = { data: [], loading: false, error: null };
    renderScreen();
    expect(screen.getByText('Couldn’t load the scenarios')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    // The manifest-only list must not be presented as the truth.
    expect(screen.queryByText('Weight / obesity denial')).not.toBeInTheDocument();
    expect(screen.queryByText('+ New scenario')).not.toBeInTheDocument();
  });

  it('blocks the list when the user-scenario read fails', () => {
    state.overrides = { data: [], loading: false, error: null };
    state.userScenarios = { data: [], loading: false, error: 'Not signed in' };
    renderScreen();
    expect(screen.getByText('Couldn’t load the scenarios')).toBeInTheDocument();
    expect(screen.queryByText('Weight / obesity denial')).not.toBeInTheDocument();
  });

  it('hides the write controls without scenarios.write', () => {
    state.overrides = { data: [], loading: false, error: null };
    state.userScenarios = { data: [], loading: false, error: null };
    renderScreen(['scenarios.read']);
    expect(screen.queryByText('+ New scenario')).not.toBeInTheDocument();
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
    // Read-only access is stated, not silently implied by missing buttons.
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
