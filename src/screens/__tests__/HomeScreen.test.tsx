import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HomeScreen } from '../HomeScreen';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';

const { go, setScenario, logEvent } = vi.hoisted(() => ({
  go: vi.fn(),
  setScenario: vi.fn(),
  logEvent: vi.fn(),
}));

let flagSnapshot: FlagSnapshot | null = null;
/** Switch values a test sets; anything absent reads its fallback (on). */
let flagValues: Record<string, unknown> = {};

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go, back: vi.fn(), replace: vi.fn(), current: 'home', history: [] }),
}));
vi.mock('../../app/providers/ScenarioProvider', () => ({
  useScenario: () => ({ scenario: null, setScenario }),
}));
vi.mock('../../app/providers/SessionProvider', () => ({
  useSession: () => ({ user: null, session: null, loading: false }),
}));
vi.mock('../../app/providers/ProfileProvider', () => ({
  useProfile: () => ({
    profile: {
      primary: 'Analyzer',
      secondary: 'Harmonizer',
      tally: { Activator: 1, Energizer: 1, Analyzer: 10, Harmonizer: 3 },
      answers: [],
      takenAt: '2026-10-01T00:00:00.000Z',
    },
    locked: true,
    setProfile: () => {},
  }),
}));
vi.mock('../../features/auth/SaveProgressBanner', () => ({ SaveProgressBanner: () => null }));
vi.mock('../../lib/analytics', () => ({ logEvent }));
vi.mock('../../app/providers/FlagProvider', async () => {
  const actual = await vi.importActual<typeof import('../../app/providers/FlagProvider')>(
    '../../app/providers/FlagProvider',
  );
  const { findOverride } = await vi.importActual<typeof import('../../services/flagsClient')>(
    '../../services/flagsClient',
  );
  return {
    ...actual,
    useFlags: () => ({
      snapshot: flagSnapshot,
      preview: null,
      ready: true,
      refresh: async () => {},
      getFlag: <T,>(key: string, fallback: T) => (key in flagValues ? (flagValues[key] as T) : fallback),
      getOverride: (id: string) => findOverride(flagSnapshot, id),
      getSimulationConfig: () => null,
    }),
  };
});

const ADMIN_CAT: ScenarioOverride = {
  scenario_id: 'admin:cat-1',
  visible: true,
  sort_order: null,
  title_override: null,
  context_override: null,
  opening_line_override: null,
  difficulty_override: null,
  persona_override: null,
  prompt_prefix: null,
  prompt_suffix: null,
  card_title_override: null,
  card_subtitle_override: null,
  info_modal_title: null,
  info_modal_body: null,
  start_button_label: null,
  card_driver_override: null,
  breed: 'Maine Coon',
  life_stage: 'Puppy (<1)',
  pushback_id: 'cost',
  pushback_notes: null,
  suggested_driver: 'Harmonizer',
  weight_kg: null,
  species: 'cat',
};

beforeEach(() => {
  vi.clearAllMocks();
  flagSnapshot = null;
  flagValues = {};
  // Skip the first-visit welcome overlay + Start-here beacon.
  localStorage.setItem('pbt:dashboard_welcomed', 'true');
  localStorage.setItem('pbt:seen_start_here', 'true');
});

const selectButton = () => screen.getByRole('button', { name: 'Select scenario' });
const dialog = () => screen.queryByRole('dialog', { name: 'How would you like to practice?' });

describe('HomeScreen — the Training library hero', () => {
  it('names no scenario: no title, no prev/next, no animal switch', () => {
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    render(<HomeScreen />);
    expect(screen.getByRole('heading', { level: 2, name: 'Training library' })).toBeInTheDocument();
    expect(screen.getByText('Pick a ready-made scenario or build your own to practice.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Previous scenario' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next scenario' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
    expect(screen.queryByText(/Weight \/ obesity denial/)).toBeNull();
    // The scoring guide stays on the hero.
    // Visible "Scoring info" label is its name; the tooltip text describes it.
    const scoring = screen.getByRole('button', { name: 'Scoring info' });
    expect(scoring).toHaveAccessibleDescription('How sessions are scored');
  });

  it('"Select scenario" opens the dialog; the library choice opens the Training library', async () => {
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    const user = userEvent.setup();
    render(<HomeScreen />);
    expect(dialog()).toBeNull();
    await user.click(selectButton());
    const d = dialog()!;
    expect(d).toHaveAttribute('aria-modal', 'true');
    // Three shipped dogs + the published cat.
    const library = within(d).getByRole('button', { name: /Choose from the library/ });
    expect(library).toHaveTextContent('4 scenarios');
    await user.click(library);
    expect(go).toHaveBeenCalledWith('scenarioLibrary');
    expect(setScenario).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ target: 'select_scenario_library' }));
  });

  it('"Build your own" opens the builder', async () => {
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.click(selectButton());
    await user.click(within(dialog()!).getByRole('button', { name: /Build your own/ }));
    expect(go).toHaveBeenCalledWith('create');
    expect(logEvent).toHaveBeenCalledWith(expect.objectContaining({ target: 'select_scenario_build' }));
  });

  it('with the builder switched off, the dialog offers the library only', async () => {
    flagValues = { 'screen.create.enabled': false };
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.click(selectButton());
    expect(within(dialog()!).getByRole('button', { name: /Choose from the library/ })).toBeInTheDocument();
    expect(within(dialog()!).queryByRole('button', { name: /Build your own/ })).toBeNull();
  });
});

describe('HomeScreen — screens switched off in Admin → Flags', () => {
  it('shows the Pet Analyzer and Fecal Scan tiles — and no "Build a scenario" tile any more', () => {
    render(<HomeScreen />);
    for (const name of ['Pet Analyzer', 'Fecal Scan']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Build a scenario' })).toBeNull();
  });

  it('hides the tile of a switched-off screen instead of leaving a dead link', () => {
    flagValues = { 'screen.fecalScan.enabled': false };
    render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Pet Analyzer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fecal Scan' })).toBeNull();
  });

  it('drops the quick-action row entirely when both screens are off', () => {
    flagValues = { 'screen.analyzer.enabled': false, 'screen.fecalScan.enabled': false };
    render(<HomeScreen />);
    for (const name of ['Pet Analyzer', 'Fecal Scan']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('names the clinical card "Clinical resources"', () => {
    render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Clinical resources' })).toBeInTheDocument();
  });
});
