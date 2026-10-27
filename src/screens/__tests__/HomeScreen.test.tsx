import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HomeScreen } from '../HomeScreen';
import type { Scenario } from '../../data/scenarios';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';

const { go, setScenario } = vi.hoisted(() => ({ go: vi.fn(), setScenario: vi.fn() }));

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
vi.mock('../../lib/analytics', () => ({ logEvent: vi.fn() }));
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

const switchGroup = () => screen.queryByRole('tablist', { name: "Animal for today's pick" });
const counter = () => screen.getByText(/^\d+\/\d+$/).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  flagSnapshot = null;
  flagValues = {};
  // Skip the first-visit welcome overlay + Start-here beacon.
  localStorage.setItem('pbt:dashboard_welcomed', 'true');
  localStorage.setItem('pbt:seen_start_here', 'true');
});

describe("HomeScreen — Today's pick animal switch", () => {
  it('shows no switch while the library only holds dogs', () => {
    render(<HomeScreen />);
    expect(switchGroup()).toBeNull();
    expect(counter()).toMatch(/\/3$/);
  });

  it('never empties the hero because of a stored cat preference when there are no cat scenarios', async () => {
    localStorage.setItem('pbt:train_species', '"cat"');
    const user = userEvent.setup();
    render(<HomeScreen />);
    expect(switchGroup()).toBeNull();
    expect(counter()).toMatch(/\/3$/);
    await user.click(screen.getByRole('button', { name: 'Start scenario' }));
    expect((setScenario.mock.calls[0][0] as Scenario).species).toBeUndefined();
  });

  it('shows no switch and no cat pick while scenario.cat.enabled is off, even with a cat scenario published', async () => {
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    localStorage.setItem('pbt:train_species', '"cat"');
    const user = userEvent.setup();
    render(<HomeScreen />);
    expect(switchGroup()).toBeNull();
    // The three shipped dogs only: the cat scenario is not in the rotation.
    expect(counter()).toMatch(/\/3$/);
    await user.click(screen.getByRole('button', { name: 'Start scenario' }));
    expect((setScenario.mock.calls[0][0] as Scenario).species).toBeUndefined();
  });

  it('shows Dog | Cat when the library holds both (cats switched on), and limits the rotation to the chosen animal', async () => {
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    const user = userEvent.setup();
    render(<HomeScreen />);
    const group = switchGroup();
    expect(group).not.toBeNull();
    expect(within(group!).getByRole('tab', { name: 'Dog' })).toHaveAttribute('aria-selected', 'true');
    expect(counter()).toMatch(/\/3$/);

    await user.click(within(group!).getByRole('tab', { name: 'Cat' }));
    expect(counter()).toBe('1/1');
    // The animal is obvious on a cat card.
    expect(screen.getByText('Cat · Maine Coon, Kitten (<1). Driver: Harmonizer.')).toBeInTheDocument();
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');

    await user.click(screen.getByRole('button', { name: 'Start scenario' }));
    const started = setScenario.mock.calls[0][0] as Scenario;
    expect(started.species).toBe('cat');
    expect(started._overrideId).toBe('admin:cat-1');

    await user.click(within(switchGroup()!).getByRole('tab', { name: 'Dog' }));
    expect(counter()).toMatch(/\/3$/);
  });

  it('draws pet icons (no emoji) on the Dog | Cat switch', () => {
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    render(<HomeScreen />);
    for (const name of ['Dog', 'Cat']) {
      const tab = within(switchGroup()!).getByRole('tab', { name });
      expect(tab.querySelector('svg')).not.toBeNull();
      expect(tab).toHaveTextContent(new RegExp(`^${name}$`));
    }
  });

  it("names the pick's category above its title", async () => {
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [ADMIN_CAT], fetchedAt: 0 };
    const user = userEvent.setup();
    render(<HomeScreen />);
    await user.click(within(switchGroup()!).getByRole('tab', { name: 'Cat' }));
    // The cat pick is a cost scenario → the built-in "Everyday nutrition".
    const title = screen.getByRole('heading', { level: 2, name: /Cost/ });
    expect(title.previousElementSibling).toHaveTextContent('Everyday nutrition');
  });
});

describe('HomeScreen — screens switched off in Admin → Flags', () => {
  it('shows all three quick actions while every screen is on', () => {
    render(<HomeScreen />);
    for (const name of ['Build a scenario', 'Pet Analyzer', 'Fecal Scan']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('hides the tile of a switched-off screen instead of leaving a dead link', () => {
    flagValues = { 'screen.fecalScan.enabled': false, 'screen.analyzer.enabled': false };
    render(<HomeScreen />);
    expect(screen.getByRole('button', { name: 'Build a scenario' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pet Analyzer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fecal Scan' })).toBeNull();
  });

  it('drops the quick-action row entirely when all three screens are off', () => {
    flagValues = {
      'screen.create.enabled': false,
      'screen.analyzer.enabled': false,
      'screen.fecalScan.enabled': false,
    };
    render(<HomeScreen />);
    for (const name of ['Build a scenario', 'Pet Analyzer', 'Fecal Scan']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });
});
